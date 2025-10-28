import os
import json
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
import nltk
from nltk.tokenize import sent_tokenize
from nltk.corpus import stopwords
import re


app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

@app.route('/')
def index():
    return jsonify({
        "status": "online",
        "message": "Fact Check API is running",
        "endpoints": {
            "/api/fact-check": "POST - Check facts in provided content",
        }
    })

# Google Fact Check API key - replace with your actual API key
FACT_CHECK_API_KEY = "AIzaSyDOrHTLNuEZEiIA-ba9_LrEz9s2Zw6TDFM"
FACT_CHECK_API_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:search"

# Uncomment these lines to download NLTK resources first time
# nltk.download('punkt')
# nltk.download('stopwords')

# Scoring thresholds
CREDIBILITY_THRESHOLDS = {
    "high": 0.8,
    "medium": 0.5,
    "low": 0.3
}

def preprocess_text(text):
    """Clean and extract key sentences from the text."""
    # Remove special characters and extra spaces
    text = re.sub(r"[^\w\s.]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    
    # Tokenize into sentences
    sentences = sent_tokenize(text)
    
    # Extract key sentences (first, middle, and last sentences)
    key_sentences = []
    if sentences:
        key_sentences.append(sentences[0])  # First sentence
        if len(sentences) > 2:
            key_sentences.append(sentences[len(sentences)//2])  # Middle sentence
        if len(sentences) > 1:
            key_sentences.append(sentences[-1])  # Last sentence
    
    return key_sentences

# Helper: detect and filter placeholder/low-information claims
def _is_placeholder_claim(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t:
        return True
    # Generic placeholders
    if t in {"facebook content", "url", "link", "article", "post", "content"}:
        return True
    # Prefixed placeholders
    if t.startswith("url:") or t.startswith("facebook url:"):
        return True
    # Raw URLs
    if re.match(r"https?://", t):
        return True
    # Very short non-informative tokens
    if len(t) < 8:
        return True
    return False


def extract_claims(text, title=""):
    """Extract potential claims from the text."""
    claims = []
    
    # Add title as a claim if it exists
    if title:
        claims.append(title)
    
    # Extract key sentences as claims
    key_sentences = preprocess_text(text)
    claims.extend(key_sentences)
    
    # Limit to 3 claims maximum (API efficiency)
    claims = claims[:3]
    
    # Deduplicate while preserving order
    seen = set()
    unique_claims = []
    for c in claims:
        k = (c or "").strip().lower()
        if k and k not in seen:
            seen.add(k)
            unique_claims.append(c.strip())
    
    # Filter placeholders
    unique_claims = [c for c in unique_claims if not _is_placeholder_claim(c)]
    return unique_claims

# --- URL-based extraction helpers ---

def _safe_sent_tokenize(text):
    """Use NLTK sent_tokenize if available, otherwise fall back to simple split."""
    try:
        return sent_tokenize(text)
    except Exception:
        return re.split(r"(?<=[.!?])\s+", text)

def _strip_scripts_styles(html):
    # Remove script and style blocks
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.IGNORECASE)
    return html

def _extract_tag_content(html, tag):
    m = re.search(rf"<{tag}[^>]*>([\s\S]*?)</{tag}>", html, flags=re.IGNORECASE)
    return m.group(1).strip() if m else None

def _extract_meta_content(html, name_or_property):
    # Match meta tags with name or property attributes
    m = re.search(rf"<meta[^>]*(?:name|property)=[\"']{re.escape(name_or_property)}[\"'][^>]*content=[\"']([\s\S]*?)[\"'][^>]*>", html, flags=re.IGNORECASE)
    return m.group(1).strip() if m else None

def _html_to_text(html):
    # Remove tags and decode entities minimally
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"&apos;", "'", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def fetch_url_content(url):
    """Fetch HTML content from a URL with a friendly user-agent."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; CrediNews/1.0; +https://example.com)"
        }
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200 and "text/html" in (resp.headers.get("Content-Type") or ""):
            return resp.text
        # Still return text for unknown types
        if resp.status_code == 200:
            return resp.text
    except Exception as e:
        print(f"Fetch URL error: {e}")
    return None


def extract_claims_from_url(url):
    """Extract headline, description, headings and quoted sentences from a web page."""
    html = fetch_url_content(url)
    if not html:
        return []

    html = _strip_scripts_styles(html)

    candidates = []
    # Prefer OpenGraph/Twitter meta titles/descriptions
    for key in ["og:title", "twitter:title", "title"]:
        val = _extract_meta_content(html, key)
        if val:
            candidates.append(val)
    # Fallback to <title>
    page_title = _extract_tag_content(html, "title")
    if page_title:
        candidates.append(page_title)
    # Meta description
    for key in ["og:description", "twitter:description", "description"]:
        val = _extract_meta_content(html, key)
        if val:
            candidates.append(val)
    # Headings
    for tag in ["h1", "h2"]:
        # Collect up to first two headings
        for m in re.finditer(rf"<{tag}[^>]*>([\s\S]*?)</{tag}>", html, flags=re.IGNORECASE):
            candidates.append(m.group(1).strip())
            if len(candidates) > 4:
                break

    # Extract quoted text (claims inside quotes)
    text = _html_to_text(html)
    for quote_pattern in [r'“([^”]{10,200})”', r'"([^\"]{10,200})"', r"'([^']{10,200})'"]:
        for m in re.finditer(quote_pattern, text):
            candidates.append(m.group(1).strip())
            if len(candidates) > 8:
                break

    # Add key sentences from body text
    sentences = _safe_sent_tokenize(text)
    if sentences:
        candidates.append(sentences[0])
        if len(sentences) > 2:
            candidates.append(sentences[len(sentences)//2])
        if len(sentences) > 1:
            candidates.append(sentences[-1])

    # Clean, de-duplicate, and trim length
    cleaned = []
    seen = set()
    for c in candidates:
        c = (c or "").strip()
        # Skip too short/too long
        if len(c) < 10 or len(c) > 300:
            continue
        k = c.lower()
        if k not in seen and not _is_placeholder_claim(c):
            seen.add(k)
            cleaned.append(c)
    # Limit to top 5 claims
    return cleaned[:5]


def check_claim_with_google_api(claim):
    """Check a single claim using Google Fact Check API."""
    params = {
        "key": FACT_CHECK_API_KEY,
        "query": claim
    }
    
    try:
        response = requests.get(FACT_CHECK_API_URL, params=params)
        if response.status_code == 200:
            return response.json()
        else:
            print(f"API Error: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Request Error: {str(e)}")
        return None


def calculate_credibility_score(fact_check_results):
    """Calculate a credibility score based on fact check results."""
    if not fact_check_results or "claims" not in fact_check_results or not fact_check_results["claims"]:
        return {
            "score": 0.5,  # Neutral score when no data
            "label": "Unverified",
            "explanation": "No fact check data available for this claim."
        }
    
    claims = fact_check_results["claims"]
    total_score = 0
    ratings = []
    
    for claim in claims:
        if "claimReview" in claim:
            for review in claim["claimReview"]:
                if "textualRating" in review:
                    rating = review["textualRating"].lower()
                    
                    # Analyze the rating text
                    if any(word in rating for word in ["false", "fake", "pants on fire", "incorrect"]):
                        ratings.append(0.0)  # False claim
                    elif any(word in rating for word in ["mostly false", "misleading"]):
                        ratings.append(0.25)  # Mostly false
                    elif any(word in rating for word in ["mixture", "mixed", "partly"]):
                        ratings.append(0.5)  # Mixed truthfulness
                    elif any(word in rating for word in ["mostly true", "accurate"]):
                        ratings.append(0.75)  # Mostly true
                    elif any(word in rating for word in ["true", "correct", "accurate"]):
                        ratings.append(1.0)  # True claim
                    else:
                        ratings.append(0.5)  # Default to neutral
    
    # Calculate average score if ratings exist
    if ratings:
        avg_score = sum(ratings) / len(ratings)
    else:
        avg_score = 0.5  # Default to neutral
    
    # Determine label based on score
    if avg_score >= CREDIBILITY_THRESHOLDS["high"]:
        label = "Highly Credible"
        explanation = "Multiple fact-checkers have verified this information as accurate."
    elif avg_score >= CREDIBILITY_THRESHOLDS["medium"]:
        label = "Mixed Credibility"
        explanation = "Some fact-checkers have verified parts of this information."
    elif avg_score >= CREDIBILITY_THRESHOLDS["low"]:
        label = "Likely Not Credible"
        explanation = "Some fact-checkers have disputed parts of this information."
    else:
        label = "Not Credible"
        explanation = "Multiple fact-checkers have identified this information as false."
    
    return {
        "score": avg_score,
        "label": label,
        "explanation": explanation
    }

@app.route('/api/fact-check', methods=['POST'])
def fact_check_endpoint():
    data = request.json
    if not data or 'title' not in data or 'content' not in data:
        return jsonify({
            'status': 'error',
            'message': 'Missing required fields: title and content'
        }), 400
    
    title = data['title']
    content = data['content']
    url = data.get('url')
    
    # Extract claims from the content
    claims = extract_claims(content, title)
    
    # If a URL is provided, augment with claims extracted from the page
    if url:
        try:
            url_claims = extract_claims_from_url(url)
            # Prefer URL claims when content is just the URL
            if len(content.strip()) <= 10 or content.strip().lower().startswith(('http://', 'https://')):
                claims = url_claims or claims
            else:
                # Merge and de-duplicate preserving order
                merged = claims + [c for c in url_claims if c.lower() not in [x.lower() for x in claims]]
                claims = merged
        except Exception as e:
            print(f"URL extraction error: {e}")
    
    # Final filtering to remove placeholders
    claims = [c for c in claims if not _is_placeholder_claim(c)]
    
    # Ensure we have at least one candidate (avoid adding generic title)
    if not claims:
        claims = []
    
    # Limit to 5 to keep API efficient
    claims = claims[:5]
    
    # Check each claim
    all_results = []
    for claim in claims:
        result = check_claim_with_google_api(claim)
        all_results.append({
            'claim': claim,
            'fact_check_result': result
        })
    
    # Process the fact check results to calculate credibility
    scores = []
    explanations = []
    
    # Additional analysis containers
    sources_set = set()
    fact_checks_count = 0
    claim_analysis = []
    fake_claims = []
    real_claims = []

    for result in all_results:
        fc_result = result["fact_check_result"]
        if fc_result and "claims" in fc_result:
            # Score/explanation
            claim_result = calculate_credibility_score(fc_result)
            scores.append(claim_result["score"])
            explanations.append(claim_result["explanation"])

            # Detailed parsing for UI
            for c in fc_result.get("claims", []):
                reviews = c.get("claimReview", [])
                # If no reviews, still include the claim with unrated info
                if not reviews:
                    info = {
                        'claim': c.get('text') or result['claim'],
                        'rating': 'Unrated',
                        'reviewer': None,
                        'title': None,
                        'url': None,
                        'reviewDate': None,
                        'explanation': 'No fact-check reviews found for this claim.'
                    }
                    claim_analysis.append(info)
                    continue

                for review in reviews:
                    fact_checks_count += 1
                    publisher = (review.get("publisher") or {}).get("name")
                    if publisher:
                        sources_set.add(publisher)

                    rating_text = (review.get("textualRating") or "").lower()
                    info = {
                        'claim': c.get('text') or result['claim'],
                        'rating': review.get('textualRating'),
                        'reviewer': publisher,
                        'title': review.get('title'),
                        'url': review.get('url'),
                        'reviewDate': review.get('reviewDate'),
                        'explanation': f"{review.get('textualRating') or 'Unrated'} by {publisher or 'Unknown reviewer'}"
                    }
                    claim_analysis.append(info)

                    # Identify fake/misleading claims
                    if any(word in rating_text for word in [
                        'false', 'fake', 'pants on fire', 'incorrect', 'misleading', 'mostly false'
                    ]):
                        fake_claims.append(info)
                    # Identify real/true claims
                    if any(word in rating_text for word in [
                        'true', 'mostly true', 'accurate', 'correct'
                    ]):
                        real_claims.append(info)
    
    # Calculate overall credibility
    if scores:
        overall_score = sum(scores) / len(scores)
        
        # Determine overall label
        if overall_score >= CREDIBILITY_THRESHOLDS["high"]:
            overall_label = "Highly Credible"
            overall_explanation = "This news appears to be factually accurate based on available fact checks."
        elif overall_score >= CREDIBILITY_THRESHOLDS["medium"]:
            overall_label = "Mixed Credibility"
            overall_explanation = "This news contains some verified information but may have minor inaccuracies."
        elif overall_score >= CREDIBILITY_THRESHOLDS["low"]:
            overall_label = "Likely Not Credible"
            overall_explanation = "This news contains several disputed claims or inaccuracies."
        else:
            overall_label = "Not Credible"
            overall_explanation = "This news contains multiple false claims according to fact checkers."
        
        # Add specific explanations if available
        if explanations:
            overall_explanation += " Details: " + " ".join(explanations[:2])
    else:
        # No fact check data available
        overall_score = 0.5
        overall_label = "Unverified"
        overall_explanation = "No fact check data available for this content."
    
    credibility = {
        "score": overall_score,
        "label": overall_label,
        "explanation": overall_explanation,
        "sources": len(sources_set),
        "factChecks": fact_checks_count
    }
    
    return jsonify({
        'status': 'success',
        'credibility': credibility,
        'claims_checked': claims,  # May be empty if none found
        'detailed_results': all_results,
        'claim_analysis': claim_analysis,
        'fake_claims': fake_claims,
        'real_claims': real_claims
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)