import os
import json
import requests
import csv
from flask import Flask, request, jsonify
from flask_cors import CORS
import nltk
from nltk.tokenize import sent_tokenize
from nltk.corpus import stopwords
import re
from typing import Dict, Any, List, Tuple

# ML model integration
try:
    from ml_models import load_saved_news_model, predict_news_label
except Exception:
    load_saved_news_model = None
    predict_news_label = None


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

# --- Facebook Graph API configuration ---
def _load_env_var(key: str, default: str = "") -> str:
    """Read environment variable, fallback to .env file if not set."""
    v = os.getenv(key)
    if v:
        return v
    # Fallback: parse local .env
    try:
        env_path = os.path.join(os.path.dirname(__file__), '.env')
        if os.path.exists(env_path):
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    if '=' in line:
                        k, val = line.split('=', 1)
                        k = k.strip()
                        val = val.strip().strip('"')
                        if k == key:
                            return val
    except Exception:
        pass
    return default

# Note: Poser detection code (Graph API) was moved to poser_detection_api.py

def _graph_get(path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return { 'error': 'Poser detection code moved to poser_detection_api.py' }

def _extract_id_from_facebook_url(url_or_id: str) -> str:
    # Stub: Poser detection code moved to poser_detection_api.py
    return (url_or_id or '').strip()

def _compute_page_signals(page: Dict[str, Any], recent_posts: List[Dict[str, Any]]) -> Dict[str, Any]:
    # Stub: Poser detection code moved to poser_detection_api.py
    return {}

def _compute_poster_signals(profile: Dict[str, Any], recent_posts: List[Dict[str, Any]]) -> Dict[str, Any]:
    # Stub: Poser detection code moved to poser_detection_api.py
    return {}

def _compute_content_signals(post: Dict[str, Any]) -> Dict[str, Any]:
    # Stub: Poser detection code moved to poser_detection_api.py
    return {}

def _compute_external_checks(page: Dict[str, Any], post: Dict[str, Any]) -> Dict[str, Any]:
    # Stub: Poser detection code moved to poser_detection_api.py
    return {}

def _classify_credibility(total_score: int, suspicious_signals: bool) -> str:
    if total_score >= 81:
        return 'Trusted Source'
    if total_score >= 61:
        return 'Likely Trusted'
    if total_score >= 41:
        return 'Neutral / Needs Verification'
    # <= 40
    return 'POSER / Low Credibility'




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
    """Clean and extract key sentences from the text, with safe tokenization fallback."""
    # Remove special characters and extra spaces
    text = re.sub(r"[^\w\s.]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    
    # Tokenize into sentences safely
    sentences = _safe_sent_tokenize(text)
    
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

# --- Slang detection helper ---
def _load_slang_dictionary() -> List[Dict[str, str]]:
    """Load Filipino slang dictionary from CSV with columns:
    word, canonical_form, meaning, usage_example
    Returns list of dict rows.
    """
    csv_path = os.path.join(os.path.dirname(__file__), 'data', 'filipino_slang_words.csv')
    rows: List[Dict[str, str]] = []
    if not os.path.exists(csv_path):
        return rows
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Normalize keys/values
                r = {
                    'word': (row.get('word') or '').strip().lower(),
                    'canonical_form': (row.get('canonical_form') or '').strip(),
                    'meaning': (row.get('meaning') or '').strip(),
                    'usage_example': (row.get('usage_example') or '').strip()
                }
                if r['word']:
                    rows.append(r)
    except Exception as e:
        print(f"Failed to load slang CSV: {e}")
    return rows

def detect_slang_words(text: str) -> List[str]:
    """Detect slang words appearing in text using the CSV dictionary."""
    if not text:
        return []
    entries = _load_slang_dictionary()
    slang_set = {e['word'] for e in entries if e.get('word')}
    # Fallback small set if CSV missing
    if not slang_set:
        slang_set = {'awit', 'yawa', 'lodi', 'werpa', 'petmalu', 'charot'}
    tokens = [t.lower() for t in re.findall(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-']+", text)]
    found = sorted(list({t for t in tokens if t in slang_set}))
    return found

def compute_sarcasm_score(text: str, slang_words: List[str]) -> Tuple[float, str]:
    """Compute sarcasm score and risk message.
    Score = (# slang words) / (total words). Threshold 0.02.
    Returns (score_float_0_1, risk_message_str).
    """
    tokens = [t.lower() for t in re.findall(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-']+", text or '')]
    total = len(tokens)
    count = len(slang_words or [])
    score = (count / total) if total > 0 else 0.0
    if score >= 0.02:
        risk = 'Potential sarcasm may affect the meaning of the post.'
    else:
        risk = 'Low – Not enough slang to indicate sarcasm.'
    return score, risk

# --- ML evidence & fallback ---
def analyze_with_ml(text: str) -> Dict[str, Any]:
    """Run ML model to classify and produce Google-like claim/evidence.
    Returns dict with: label ('fake'|'real' or None), confidence (0..1 or None),
    synthetic_factcheck (google-like claims structure), evidence (keywords, sections, features).
    """
    result: Dict[str, Any] = {
        'label': None,
        'confidence': None,
        'synthetic_factcheck': None,
        'evidence': {}
    }
    if not text:
        return result
    try:
        model = load_saved_news_model('news_lr_pipeline.joblib') if load_saved_news_model else None
        if model is None:
            return result
        # Predict label
        try:
            label = predict_news_label(text, model)
        except Exception:
            label = None
        # Confidence via predict_proba if available
        conf = None
        try:
            if hasattr(model, 'predict_proba'):
                probs = model.predict_proba([text])[0]
                # Assume classes order corresponds to model.classes_
                # Map to 'fake'/'real' if possible
                classes = getattr(getattr(model, 'steps', [None])[-1][1], 'classes_', None) if hasattr(model, 'steps') else None
                # If pipeline, try last estimator
                if classes is None and hasattr(model, 'classes_'):
                    classes = model.classes_
                if classes is not None:
                    # Find probability for predicted label
                    if label is not None and label in classes:
                        conf = float(probs[list(classes).index(label)])
                    else:
                        conf = float(max(probs))
                else:
                    conf = float(max(probs))
        except Exception:
            conf = None

        # Build synthetic google-like claim result
        textual = 'True' if str(label).lower() == 'real' else 'False' if str(label).lower() == 'fake' else 'Unrated'
        snippet = (text[:200] + '...') if len(text) > 200 else text
        synthetic = {
            'claims': [
                {
                    'text': snippet,
                    'claimReview': [
                        {
                            'textualRating': textual,
                            'publisher': {'name': 'ML Model'},
                            'title': 'ML Classification',
                            'url': None,
                            'reviewDate': None
                        }
                    ]
                }
            ]
        }

        # Evidence: top words (simple heuristic)
        words = [w.lower() for w in re.findall(r"[A-Za-zÀ-ÿ]{4,}", text)]
        stop = set(stopwords.words('english')) if 'english' in stopwords._fileids else set()
        freq: Dict[str, int] = {}
        for w in words:
            if w not in stop:
                freq[w] = freq.get(w, 0) + 1
        top_keywords = [w for w, _ in sorted(freq.items(), key=lambda x: x[1], reverse=True)[:8]]
        slang_found = detect_slang_words(text)
        sarcasm_score, sarcasm_risk = compute_sarcasm_score(text, slang_found)
        evidence = {
            'keywords': top_keywords,
            'sections': ['headline', 'content'] if len(text) > 120 else ['content'],
            'matched_features': ['slang_detected'] if slang_found else []
        }

        result.update({
            'label': label,
            'confidence': conf,
            'synthetic_factcheck': synthetic,
            'evidence': evidence,
            'slang_found': slang_found,
            'sarcasm_score': sarcasm_score,
            'sarcasm_risk': sarcasm_risk
        })
        return result
    except Exception as e:
        print(f"ML fallback error: {e}")
        return result


# --- ML Endpoints ---
@app.route('/api/ml-verify', methods=['POST'])
def api_ml_verify():
    """Verify news text (or URL) using the trained ML model.
    Request JSON: { text?: string, url?: string }
    Response: { status, label, source, model }
    """
    if predict_news_label is None:
        return jsonify({'status': 'error', 'message': 'ML model functions not available'}), 500

    data = request.get_json(force=True) or {}
    text = data.get('text')
    url = data.get('url')
    source = 'text'

    if not text and url:
        try:
            html = fetch_url_content(url)
            text = _html_to_text(html) if html else None
            source = 'url'
        except Exception as e:
            return jsonify({'status': 'error', 'message': f'Failed to fetch URL: {e}'}), 400

    if not text:
        return jsonify({'status': 'error', 'message': 'Provide text or url'}), 400

    model = load_saved_news_model('news_lr_pipeline.joblib') if load_saved_news_model else None
    if model is None:
        return jsonify({'status': 'error', 'message': 'ML model not found. Run training first.'}), 500

    label = predict_news_label(text, model)
    return jsonify({
        'status': 'success',
        'label': label,
        'source': source,
        'model': 'news_lr_pipeline.joblib'
    })


@app.route('/api/ml-metrics', methods=['GET'])
def api_ml_metrics():
    """Return stored metrics for the trained ML model."""
    metrics_path = os.path.join(os.path.dirname(__file__), 'models', 'news_lr_metrics.json')
    if not os.path.exists(metrics_path):
        return jsonify({'status': 'error', 'message': 'Metrics file not found'}), 404
    try:
        with open(metrics_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify({'status': 'success', 'metrics': data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Failed to read metrics: {e}'}), 500


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
    
    # Check each claim via Google Fact Check
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
                        'explanation': 'No poser check reviews found for this claim.'
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

    # Determine if Google Fact Check produced any claims
    has_google_claims = any(
        r.get('fact_check_result') and r['fact_check_result'].get('claims') for r in all_results
    )

    ml_details = None
    # ML fallback when no Google claims
    if not has_google_claims:
        aggregate_text = f"{title}\n\n{content}\n\n{url or ''}".strip()
        ml = analyze_with_ml(aggregate_text)
        ml_details = {
            'label': ml.get('label'),
            'confidence': ml.get('confidence'),
            'evidence': ml.get('evidence')
        }
        synthetic = ml.get('synthetic_factcheck')
        if synthetic:
            # Add ML as a source
            sources_set.add('ML Model')
            # Treat synthetic as another claim to feed scoring
            all_results.append({
                'claim': 'ML Classification',
                'fact_check_result': synthetic
            })
            # Also add to claim_analysis for UI
            try:
                claims_list = synthetic.get('claims', [])
                for c in claims_list:
                    reviews = c.get('claimReview', [])
                    for review in reviews:
                        fact_checks_count += 1
                        rating_text = (review.get('textualRating') or '').lower()
                        info = {
                            'claim': c.get('text') or 'Model-detected evidence',
                            'rating': review.get('textualRating'),
                            'reviewer': 'ML Model',
                            'title': review.get('title'),
                            'url': None,
                            'reviewDate': None,
                            'explanation': f"ML classified as {review.get('textualRating')} with confidence { (ml.get('confidence') or 0.0) * 100:.0f}%"
                        }
                        claim_analysis.append(info)
                        if any(word in rating_text for word in ['false']):
                            fake_claims.append(info)
                        if any(word in rating_text for word in ['true']):
                            real_claims.append(info)
            except Exception as e:
                print(f"Failed to append ML synthetic claim: {e}")
    
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

    # Slang detection and sarcasm scoring (on combined text)
    combined_text = f"{title} {content} {url or ''}"
    slang_found = detect_slang_words(combined_text)
    sarcasm_score, sarcasm_risk = compute_sarcasm_score(combined_text, slang_found)

    return jsonify({
        'status': 'success',
        'credibility': credibility,
        'claims_checked': claims,  # May be empty if none found
        'detailed_results': all_results,
        'claim_analysis': claim_analysis,
        'fake_claims': fake_claims,
        'real_claims': real_claims,
        'ml_details': ml_details,
        'slang_detected': slang_found,
        'sarcasm_score': sarcasm_score,
        'sarcasm_percent': round(sarcasm_score * 100, 2),
        'sarcasm_risk': sarcasm_risk,
        'tone': ('Risk: Potential sarcasm may affect the meaning of the post.' if sarcasm_score >= 0.02 else 'Risk: Low – Not enough slang to indicate sarcasm.')
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
