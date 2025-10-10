import os
import json
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
import nltk
from nltk.tokenize import sent_tokenize
from nltk.corpus import stopwords
import re


# Download NLTK resources (uncomment first time)
# nltk.download('punkt')
# nltk.download('stopwords')

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
    text = re.sub(r'[^\w\s.]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    
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
    return claims[:3]

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

# @app.route('/api/fact-check', methods=['POST'])
# def fact_check():
#     """API endpoint to fact check news content."""
#     data = request.json
    
#     if not data or 'content' not in data:
#         return jsonify({
#             "error": "Missing required fields",
#             "status": "error"
#         }), 400
    
#     content = data.get('content', '')
#     title = data.get('title', '')
    
#     # Extract claims from the content
#     claims = extract_claims(content, title)
    
#     # Check each claim
#     all_results = []
#     for claim in claims:
#         result = check_claim_with_google_api(claim)
#         if result:
#             all_results.append({
#                 "claim": claim,
#                 "fact_check_result": result
#             })
    
#     # Calculate overall credibility score
#     overall_score = 0.5  # Default neutral score
#     overall_label = "Unverified"
#     overall_explanation = "No fact check data available."
    
#     if all_results:
#         scores = []
#         for result in all_results:
#             if "fact_check_result" in result:
#                 score_data = calculate_credibility_score(result["fact_check_result"])
#                 scores.append(score_data["score"])
        
#         if scores:
#             overall_score = sum(scores) / len(scores)
            
#             # Determine overall label
#             if overall_score >= CREDIBILITY_THRESHOLDS["high"]:
#                 overall_label = "Highly Credible"
#                 overall_explanation = "This news appears to be factually accurate based on available fact checks."
#             elif overall_score >= CREDIBILITY_THRESHOLDS["medium"]:
#                 overall_label = "Somewhat Credible"
#                 overall_explanation = "This news contains some verified information but may have minor inaccuracies."
#             elif overall_score >= CREDIBILITY_THRESHOLDS["low"]:
#                 overall_label = "Low Credibility"
#                 overall_explanation = "This news contains several disputed claims or inaccuracies."
#             else:
#                 overall_label = "Not Credible"
#                 overall_explanation = "This news contains multiple false claims according to fact checkers."
    
#     response = {
#         "status": "success",
#         "credibility": {
#             "score": overall_score,
#             "label": overall_label,
#             "explanation": overall_explanation
#         },
#         "detailed_results": all_results
#     }
    
#     return jsonify(response)

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
    
    # Extract claims from the content
    claims = extract_claims(content, title)
    
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
    
    for result in all_results:
        if result["fact_check_result"] and "claims" in result["fact_check_result"]:
            claim_result = calculate_credibility_score(result["fact_check_result"])
            scores.append(claim_result["score"])
            explanations.append(claim_result["explanation"])
    
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
        "explanation": overall_explanation
    }
    
    return jsonify({
        'status': 'success',
        'credibility': credibility,
        'detailed_results': all_results
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)