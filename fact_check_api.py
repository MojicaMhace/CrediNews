import os
import json
import requests
import csv
from flask import Flask, request, jsonify
import time
from flask_cors import CORS
import nltk
from nltk.tokenize import sent_tokenize
from nltk.corpus import stopwords
import re
from typing import Dict, Any, List, Tuple, Optional
from urllib.parse import urlparse, unquote

# --- NEW: Load .env file explicitly ---
try:
    from dotenv import load_dotenv
    load_dotenv() # This loads variables from .env into os.environ
    print("DEBUG: .env file loaded successfully.")
except ImportError:
    print("WARNING: python-dotenv not installed. Using system environment variables.")

# ML model integration
try:
    from ml_models import load_saved_news_model, predict_news_label
except Exception:
    load_saved_news_model = None
    predict_news_label = None

app = Flask(__name__)
CORS(app)

@app.route('/')
def index():
    return jsonify({
        "status": "online",
        "message": "Fact Check API is running",
        "zyla_enabled": ZYLA_ENABLED
    })

# Google Fact Check API key
FACT_CHECK_API_KEY = os.environ.get("FACT_CHECK_API_KEY", "AIzaSyDOrHTLNuEZEiIA-ba9_LrEz9s2Zw6TDFM")
FACT_CHECK_API_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:search"

# Zyla Labs Configuration
ZYLA_API_URL = os.environ.get("ZYLA_API_URL", "https://zylalabs.com/api/2753/fact+checking+api/2860/check+facts")
ZYLA_API_KEY = os.environ.get("ZYLA_API_KEY", "11018|hgGq1lMPYDpnVFB7YHAPcVpxgtjvWP9zlSFUJ5YS")

# FORCE ENABLED FOR PRESENTATION
ZYLA_ENABLED = True

# Cache
_ZYLA_CACHE: Dict[str, Dict[str, Any]] = {}
_ZYLA_CACHE_TTL_SEC = 24 * 3600

# Uncomment these lines to download NLTK resources first time
# nltk.download('punkt')
# nltk.download('stopwords')

# Scoring thresholds
CREDIBILITY_THRESHOLDS = {
    "high": 0.75,
    "medium": 0.55,
    "unverified_upper": 0.54,
    "unverified_lower": 0.46
}

# Unified neutral fallback for scoring and helpers
NEUTRAL_DEFAULT_SCORE = 0.5

def _neutral_score() -> float:
    return NEUTRAL_DEFAULT_SCORE

def _clamp01(x: float) -> float:
    try:
        return max(0.0, min(1.0, float(x)))
    except Exception:
        return _neutral_score()

# Credible domain boost configuration
# Domains listed here slightly increase borderline scores when no negative evidence exists.
# Keep boosts small to avoid overwhelming explicit fact-check verdicts.

# Combined Dictionary for Websites (Domains)
CREDIBLE_WEBSITES: Dict[str, Dict[str, Any]] = {
    # --- PHILIPPINES: Major Nationals (High Reputation) ---
    'rappler.com':      {'score': 0.25, 'name': 'Rappler'},
    'inquirer.net':     {'score': 0.25, 'name': 'Inquirer.net'},
    'news.abs-cbn.com': {'score': 0.25, 'name': 'ABS-CBN News'},
    'gmanetwork.com':   {'score': 0.25, 'name': 'GMA Network'},
    'philstar.com':     {'score': 0.25, 'name': 'Philstar.com'},
    'mb.com.ph':        {'score': 0.25, 'name': 'Manila Bulletin'},
    'bworldonline.com': {'score': 0.25, 'name': 'BusinessWorld'},
    'verafiles.org':    {'score': 0.25, 'name': 'VERA Files'},

    # --- PHILIPPINES: Broadcasters & Aggregators ---
    'cnnphilippines.com':       {'score': 0.25, 'name': 'CNN Philippines (Archived)'},
    'onenews.ph':               {'score': 0.20, 'name': 'One News PH'},
    'news.tv5.com.ph':          {'score': 0.20, 'name': 'News5 (TV5)'},
    'interaksyon.philstar.com': {'score': 0.20, 'name': 'Interaksyon'},

    # --- PHILIPPINES: Regional & Other Nationals ---
    'sunstar.com.ph':  {'score': 0.20, 'name': 'SunStar Philippines'},
    'manilatimes.net': {'score': 0.20, 'name': 'The Manila Times'},
    'mindanews.com':   {'score': 0.20, 'name': 'MindaNews'},
    'tribu.net.ph':    {'score': 0.20, 'name': 'Daily Tribune'},
    'bulatlat.com':    {'score': 0.20, 'name': 'Bulatlat'},

    # --- INTERNATIONAL: Wire Services ---
    'reuters.com':   {'score': 0.25, 'name': 'Reuters'},
    'apnews.com':    {'score': 0.25, 'name': 'Associated Press (AP)'},
    'afp.com':       {'score': 0.25, 'name': 'Agence France-Presse (AFP)'},
    'bloomberg.com': {'score': 0.25, 'name': 'Bloomberg'},

    # --- INTERNATIONAL: Prestige Global Media (Tier 1) ---
    'bbc.com':            {'score': 0.25, 'name': 'BBC News'},
    'bbc.co.uk':          {'score': 0.25, 'name': 'BBC News (UK)'},
    'cnn.com':            {'score': 0.25, 'name': 'CNN International'},
    'nytimes.com':        {'score': 0.25, 'name': 'The New York Times'},
    'washingtonpost.com': {'score': 0.25, 'name': 'The Washington Post'},
    'wsj.com':            {'score': 0.25, 'name': 'The Wall Street Journal'},
    'aljazeera.com':      {'score': 0.25, 'name': 'Al Jazeera'},
    'dw.com':             {'score': 0.25, 'name': 'Deutsche Welle (DW)'},
    'france24.com':       {'score': 0.25, 'name': 'France 24'},
    'npr.org':            {'score': 0.25, 'name': 'NPR (National Public Radio)'},

    # --- INTERNATIONAL: Recognized Global Media (Tier 2) ---
    'theguardian.com':     {'score': 0.20, 'name': 'The Guardian'},
    'cnbc.com':            {'score': 0.20, 'name': 'CNBC'},
    'time.com':            {'score': 0.20, 'name': 'TIME Magazine'},
    'usatoday.com':        {'score': 0.20, 'name': 'USA Today'},
    'scmp.com':            {'score': 0.20, 'name': 'South China Morning Post'},
    'nikkei.com':          {'score': 0.20, 'name': 'Nikkei Asia'},
    'channelnewsasia.com': {'score': 0.20, 'name': 'CNA (Channel News Asia)'},
    'straitstimes.com':    {'score': 0.20, 'name': 'The Straits Times'},
}

CREDIBLE_SOCIAL_PATTERNS: List[Dict[str, Any]] = [
    # --- PHILIPPINES: Facebook Handles ---
    {'pattern': r"facebook\.com/(rapplerdotcom|rappler)", 'score': 0.25, 'name': 'Rappler (Facebook)'},
    {'pattern': r"facebook\.com/inquirerdotnet",          'score': 0.25, 'name': 'Inquirer.net (Facebook)'},
    {'pattern': r"facebook\.com/abscbnNEWS",              'score': 0.25, 'name': 'ABS-CBN News (Facebook)'},
    {'pattern': r"facebook\.com/gmanews",                 'score': 0.25, 'name': 'GMA News (Facebook)'},
    {'pattern': r"facebook\.com/PhilippineStar",          'score': 0.25, 'name': 'The Philippine Star (Facebook)'},
    {'pattern': r"facebook\.com/manilabulletin",          'score': 0.25, 'name': 'Manila Bulletin (Facebook)'},
    {'pattern': r"facebook\.com/BusinessWorldOnline",     'score': 0.25, 'name': 'BusinessWorld (Facebook)'},
    {'pattern': r"facebook\.com/verafiles",               'score': 0.25, 'name': 'VERA Files (Facebook)'},
    {'pattern': r"facebook\.com/rapplerlife",             'score': 0.25, 'name': 'Rappler Life (Facebook)'},
    {'pattern': r"facebook\.com/dilg.philippines",        'score': 0.25, 'name': 'DILG Philippines (Official)'},

    # --- PHILIPPINES: Tier 2 / Regional ---
    {'pattern': r"facebook\.com/ONENewsPH",               'score': 0.20, 'name': 'One News PH (Facebook)'},
    {'pattern': r"facebook\.com/News5Everywhere",         'score': 0.20, 'name': 'News5 (Facebook)'},
    {'pattern': r"facebook\.com/interaksyon",             'score': 0.20, 'name': 'Interaksyon (Facebook)'},
    {'pattern': r"facebook\.com/sunstarphilippines",      'score': 0.20, 'name': 'SunStar Philippines (Facebook)'},
    {'pattern': r"facebook\.com/themanilatimesonline",    'score': 0.20, 'name': 'The Manila Times (Facebook)'},
    {'pattern': r"facebook\.com/mindanews",               'score': 0.20, 'name': 'MindaNews (Facebook)'},

    # --- INTERNATIONAL: Wire Services & Global Giants ---
    {'pattern': r"facebook\.com/Reuters",                 'score': 0.25, 'name': 'Reuters (Facebook)'},
    {'pattern': r"facebook\.com/APNews",                  'score': 0.25, 'name': 'Associated Press (Facebook)'},
    {'pattern': r"facebook\.com/AFPnewsenglish",          'score': 0.25, 'name': 'AFP News (Facebook)'},
    {'pattern': r"facebook\.com/bbcnews",                 'score': 0.25, 'name': 'BBC News (Facebook)'},
    {'pattern': r"facebook\.com/cnn",                     'score': 0.25, 'name': 'CNN (Facebook)'},
    {'pattern': r"facebook\.com/nytimes",                 'score': 0.25, 'name': 'New York Times (Facebook)'},
    {'pattern': r"facebook\.com/washingtonpost",          'score': 0.25, 'name': 'Washington Post (Facebook)'},
    {'pattern': r"facebook\.com/bloombergbusiness",       'score': 0.25, 'name': 'Bloomberg Business (Facebook)'},
    {'pattern': r"facebook\.com/aljazeera",               'score': 0.25, 'name': 'Al Jazeera (Facebook)'},
    {'pattern': r"facebook\.com/dw.deutschewelle",        'score': 0.25, 'name': 'DW Deutsche Welle (Facebook)'},

    # --- INTERNATIONAL: Tier 2 ---
    {'pattern': r"facebook\.com/theguardian",             'score': 0.20, 'name': 'The Guardian (Facebook)'},
    {'pattern': r"facebook\.com/cnbc",                    'score': 0.20, 'name': 'CNBC (Facebook)'},
    {'pattern': r"facebook\.com/time",                    'score': 0.20, 'name': 'TIME (Facebook)'},
    {'pattern': r"facebook\.com/channelnewsasia",         'score': 0.20, 'name': 'CNA (Facebook)'},
]

def _extract_domain(url: str) -> str:
    try:
        from urllib.parse import urlparse
        host = urlparse(url).netloc.lower()
        host = host.split(':')[0]
        if host.startswith('www.'):
            host = host[4:]
        return host
    except Exception:
        return ''

def _credible_boost_for_url(url: Optional[str]) -> float:
    if not url:
        return 0.0
    try:
        domain = _extract_domain(url)
        info = CREDIBLE_WEBSITES.get(domain)
        base = float((info or {}).get('score', 0.0))
        pat_boost = 0.0
        for entry in CREDIBLE_SOCIAL_PATTERNS:
            try:
                pat = entry.get('pattern')
                b = float(entry.get('score', 0.0))
                if pat and re.search(pat, url, flags=re.IGNORECASE):
                    pat_boost = max(pat_boost, b)
            except Exception:
                continue
        return max(base, pat_boost)
    except Exception:
        return 0.0

def _credible_source_name(url: Optional[str]) -> str:
    if not url:
        return ''
    try:
        for entry in CREDIBLE_SOCIAL_PATTERNS:
            pat = entry.get('pattern')
            if pat and re.search(pat, url, flags=re.IGNORECASE):
                name = entry.get('name')
                if name:
                    return str(name)
        domain = _extract_domain(url)
        info = CREDIBLE_WEBSITES.get(domain)
        if isinstance(info, dict) and info.get('name'):
            return str(info['name'])
        return domain
    except Exception:
        return _extract_domain(url or '')

def _now() -> float:
    return time.time()

def _zyla_cache_get(key: str) -> Any:
    try:
        entry = _ZYLA_CACHE.get(key)
        if not entry:
            return None
        if (_now() - float(entry.get("ts", 0))) > _ZYLA_CACHE_TTL_SEC:
            # Expired
            _ZYLA_CACHE.pop(key, None)
            return None
        return entry.get("data")
    except Exception:
        return None

def _zyla_cache_set(key: str, data: Any) -> None:
    try:
        _ZYLA_CACHE[key] = {"ts": _now(), "data": data}
    except Exception:
        pass

def extract_real_fb_url(share_url: str) -> Optional[str]:
    """
    Safely resolve a Facebook share link to its canonical post URL.
    Only uses public HTML (og:url meta tag); no login, no Selenium, no TOS breach.
    Returns the canonical URL or None if resolution fails.
    """
    if not share_url or "facebook.com/share/" not in share_url:
        return None
    try:
        resp = requests.get(share_url, timeout=8, headers={"User-Agent": "CrediNews-Bot/1.0"})
        resp.raise_for_status()
    except Exception:
        return None
    match = re.search(r'<meta\s+property=["\']og:url["\']\s+content=["\'](https?://[^"\']+)["\']', resp.text, re.IGNORECASE)
    return match.group(1) if match else None

@app.route('/api/resolve-facebook-share', methods=['POST'])
def resolve_facebook_share():
    data = request.get_json(force=True) or {}
    share_url = (data.get('url') or '').strip()
    if not share_url:
        return jsonify({'status': 'error', 'message': 'Missing url'}), 400
    try:
        resolved = extract_real_fb_url(share_url)
        return jsonify({'status': 'success', 'resolved_url': resolved})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

def query_zyla_fact_check(user_content: str) -> Dict[str, Any]:
    """
    Query Zyla API using GET method with Browser User-Agent.
    Includes explicit debugging and error handling.
    """
    uc = (user_content or "").strip()
    if not uc:
        print("[Zyla] Skipped: Empty content")
        return {}
    if not ZYLA_ENABLED:
        print("[Zyla] Skipped: Disabled via config")
        return {}

    # Check cache
    cache_key = f"zyla:{uc[:512]}"
    cached = _zyla_cache_get(cache_key)
    if cached is not None:
        # Validate that cached data is not empty before returning
        if cached.get('verdict') or cached.get('fact_check_result'):
            print("[Zyla] Returning cached result")
            return cached
        else:
             # If we cached an empty/failed result previously, ignore it and retry
            print("[Zyla] Invalid cache detected. Retrying API...")

    headers = {
        'Authorization': f'Bearer {ZYLA_API_KEY}',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    params = {'user_content': uc}

    # Safety fix for URL typo
    target_url = ZYLA_API_URL.strip()
    if target_url.endswith('5'):
        print("[Zyla] Auto-correcting URL typo...")
        target_url = target_url[:-1]

    try:
        print(f"[Zyla] Sending GET request to: {target_url}")
        print(f"[Zyla] Input (first 50 chars): {uc[:50]}...")
        
        # Increased timeout to 30s
        resp = requests.get(target_url, headers=headers, params=params, timeout=30)
        
        print(f"[Zyla] Response Status: {resp.status_code}")
        
        if resp.status_code == 200:
            try:
                raw_data = resp.json()
                print(f"[Zyla] Raw Body: {str(raw_data)[:200]}")
                data = parse_zyla_response(raw_data)
                
                # ONLY CACHE IF SUCCESSFUL
                if data.get('verdict'):
                    _zyla_cache_set(cache_key, data)
                
                return data
            except Exception as je:
                print(f"[Zyla] JSON parse failed: {je}; Body: {resp.text[:500]}")
                return {}
        else:
            print(f"[Zyla] API Error {resp.status_code}: {resp.text}")
            return {}

    except Exception as e:
        print(f"[Zyla] Request Exception: {e}")
        return {}

# --- NEW DEBUG ENDPOINT ---
@app.route('/api/test-zyla-direct', methods=['GET'])
def debug_zyla():
    """Directly test Zyla API from browser to verify backend connectivity"""
    test_text = request.args.get('text', 'The earth is flat.')
    print(f"--- DEBUGGING ZYLA WITH: {test_text} ---")
    result = query_zyla_fact_check(test_text)
    return jsonify({
        "input": test_text,
        "api_key_used": ZYLA_API_KEY[:10] + "...",
        "api_url_used": ZYLA_API_URL,
        "result": result
    })

def parse_zyla_response(data: Any) -> Dict[str, Any]:
    """
    Robust parser that handles Zyla's inconsistent JSON formats (List vs Dict, Case sensitivity).
    """
    # 1. Normalize Structure: Handle Stringified JSON inside List (["{...}"])
    if isinstance(data, list):
        item = None
        for it in data:
            if isinstance(it, dict):
                item = it
                break
            if isinstance(it, str):
                try:
                    item = json.loads(it)
                    break
                except Exception:
                    continue
        data = item or {}
    elif isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            data = {}
            
    if not isinstance(data, dict):
        print("[Zyla Parse] Error: Data is not a dictionary after normalization")
        return {
            'verdict': None, 'confidence': None, 'statement': None,
            'analysis': None, 'explanation': None, 'claim': None, 'sources': []
        }

    # DEBUG: Print keys to help diagnose missing verdict
    print(f"[Zyla Parse] Keys found: {list(data.keys())}")

    # 2. Extract Verdict (Case-Insensitive Search)
    # Convert all keys to lowercase for easier lookup
    data_lower = {k.lower(): v for k, v in data.items()}
    
    verdict_raw = (
        data_lower.get('verdict') or 
        data_lower.get('fact_check') or 
        data_lower.get('fact_check_result') or # Targets "fact_check_result"
        data_lower.get('result') or 
        data_lower.get('status') or 
        ''
    ).strip().lower()

    print(f"[Zyla Parse] Raw Verdict Found: '{verdict_raw}'")

    # Normalize verdict synonyms
    verdict_map = {
        'verified': 'true', 'correct': 'true', 'accurate': 'true', 'true': 'true',
        'false': 'false', 'fake': 'false', 'incorrect': 'false', 'not verified': 'false', 'unverified': 'false',
        'misleading': 'partially_true', 'mixed': 'partially_true', 'partially true': 'partially_true',
    }
    verdict = verdict_map.get(verdict_raw, verdict_raw)

    # 3. Extract Confidence
    confidence = data_lower.get('confidence')
    if isinstance(confidence, (int, float)):
        confidence = float(confidence)
        if confidence > 1.0: confidence /= 100.0
        confidence = max(0.0, min(1.0, confidence))
    else:
        confidence = 0.9 if verdict in ['true', 'false'] else 0.5

    # 4. Extract Explanation
    explanation = (
        data_lower.get('explanation') or 
        data_lower.get('reason') or 
        data_lower.get('analysis') or 
        None
    )

    return {
        'verdict': verdict or None,
        'confidence': confidence,
        'statement': data_lower.get('statement'),
        'analysis': data_lower.get('analysis'),
        'explanation': explanation,
        'claim': data_lower.get('claim'),
        'sources': data.get('sources', [])
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

def _is_meaningful_statement(s: str) -> bool:
    """Basic guard to avoid sending placeholders to Zyla.
    Requires medium length, multiple words, and no raw URL content.
    """
    if not s:
        return False
    t = s.strip()
    # Relax length threshold to allow concise slug-based fallbacks
    # This increases Zyla coverage when content is short but meaningful.
    if len(t) < 15:
        return False
    if t.lower().startswith(('url:', 'facebook url:')):
        return False
    if 'http://' in t.lower() or 'https://' in t.lower():
        return False
    # At least 4 words containing letters
    words = [w for w in re.split(r"\s+", t) if re.search(r"[a-zA-Z]", w)]
    if len(words) < 4:
        return False
    return True

def build_zyla_safe_input(text: str) -> str:
    if not text:
        return ""
    raw = (text or "").strip()
    cleaned = re.sub(r"\s+", " ", raw).strip()
    if not cleaned and raw:
        return raw[:1500].strip()
    return cleaned[:1500]

# --- URL-based extraction helpers ---

def build_claim_from_url_slug(url: str) -> str:
    """Construct a simple, non-empty statement from a URL's slug.
    Produces a short sentence suitable as a fallback claim/primary statement.
    """
    try:
        parsed = urlparse(url)
        domain = (parsed.netloc or '').lower()
        domain = domain[4:] if domain.startswith('www.') else domain
        path = unquote(parsed.path or '')
        segs = [s for s in path.split('/') if s]
        # Filter common non-content segments
        segs = [s for s in segs if s.lower() not in {'amp', 'm', 'en', 'index'}]
        candidate = segs[-1] if segs else ''

        # Special handling for Facebook post URLs: prefer page/user segment over post ID
        if domain == 'facebook.com':
            try:
                # e.g., /ONENewsPH/posts/<pfbid...>
                if 'posts' in [s.lower() for s in segs] and len(segs) >= 2:
                    page_name = segs[0]
                    topic = f"a Facebook post by {page_name}"
                else:
                    topic = 'a Facebook post'
            except Exception:
                topic = 'a Facebook post'
        else:
            topic = re.sub(r"[-_]+", " ", candidate).strip() or domain or 'link'
        topic = topic[:160]
        # Phrase to exceed 6 meaningful words and be Zyla-friendly
        if domain:
            return f"The article from {domain} discusses {topic} and needs verification."
        else:
            return f"The content discusses {topic} and needs verification."
    except Exception:
        return "This content from the provided link needs verification."

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
        print(f"Slang CSV not found at: {csv_path}")
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
    if not rows:
        print(f"Slang CSV loaded but no valid entries found")
    return rows

def detect_slang_words(text: str) -> List[str]:
    """Detect slang words appearing in text using the CSV dictionary only."""
    if not text:
        return []
    entries = _load_slang_dictionary()
    slang_set = {e['word'] for e in entries if e.get('word')}
    # No fallback - if CSV is empty/missing, return empty list
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


def scrape_with_playwright(url: str) -> str:
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ))
            page = context.new_page()
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=15000)
            except Exception:
                try:
                    page.goto(url, timeout=15000)
                except Exception:
                    browser.close()
                    return ""
            try:
                page.wait_for_selector("body", timeout=15000)
            except Exception:
                pass
            for sel in [
                'button:has-text("Not Now")',
                'button:has-text("Close")',
                'div[aria-label="Close"]',
                'div[role="dialog"] button'
            ]:
                try:
                    page.locator(sel).first.click(timeout=1000)
                except Exception:
                    pass
            text_content = ""
            for container_sel in [
                '[role="article"]',
                'div[role="main"]',
                'body'
            ]:
                try:
                    container = page.locator(container_sel)
                    count = container.count()
                    if count > 0:
                        if container_sel == 'body':
                            text_content = container.inner_text()
                            break
                        inner = container.locator('p, span, div[dir="auto"]')
                        try:
                            parts = inner.all_inner_texts()
                            joined = " ".join([t.strip() for t in parts if t and t.strip()])
                        except Exception:
                            joined = container.inner_text()
                        if joined and joined.strip():
                            text_content = joined.strip()
                            break
                except Exception:
                    continue
            try:
                browser.close()
            except Exception:
                pass
            text_content = re.sub(r"\s+", " ", (text_content or "")).strip()
            return text_content
    except Exception as e:
        print(f"Playwright scrape failed: {e}")
        return ""


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

def select_key_claim_from_candidates(candidates: List[str]) -> str:
    """Pick the most important sentence/claim from candidates.
    Prefers medium-length sentences and headlines.
    """
    if not candidates:
        return ""
    # Simple heuristic: prefer 60–200 chars and headline-like strings first
    def score(c: str) -> float:
        length = len(c)
        # Base score favors 60–200 char length
        len_score = 1.0 - (abs((length - 130) / 130))  # peak at ~130
        # Headline boost if few commas and ends without period
        headlineish = 0.3 if (c.count(',') <= 1 and not c.strip().endswith('.')) else 0.0
        # Assertive verbs (is/are/claims/says/reports) boost
        assertive = 0.2 if re.search(r"\b(is|are|claims?|says|reports)\b", c, flags=re.IGNORECASE) else 0.0
        return len_score + headlineish + assertive
    best = max(candidates, key=score)
    return best

@app.route('/api/extract-key-claim', methods=['POST'])
def api_extract_key_claim():
    """Return the most important sentence/claim from a URL.
    Request: { url: string }
    Response: { status, key_claim, candidates }
    """
    data = request.get_json(force=True) or {}
    url = (data.get('url') or '').strip()
    if not url:
        return jsonify({'status': 'error', 'message': 'Missing url'}), 400
    try:
        candidates = extract_claims_from_url(url)
        key_claim = select_key_claim_from_candidates(candidates) if candidates else ''
        return jsonify({'status': 'success', 'key_claim': key_claim, 'candidates': candidates})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Failed to extract: {e}'}), 500


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
            "score": _neutral_score(),
            "label": "Unverified",
            "explanation": "No fact check data available for this claim."
        }
    
    claims = fact_check_results["claims"]
    ratings = []
    
    for claim in claims:
        if "claimReview" in claim:
            for review in claim["claimReview"]:
                if "textualRating" in review:
                    rating = review["textualRating"].lower()
                    
                    # Analyze the rating text
                    if any(word in rating for word in ["false", "fake", "pants on fire", "incorrect"]):
                        ratings.append(0.1)  # False claim
                    elif any(word in rating for word in ["mostly false", "misleading"]):
                        ratings.append(0.3)  # Mostly false
                    elif any(word in rating for word in ["mixture", "mixed", "partly", "partially", "half true"]):
                        ratings.append(0.6)  # Mixed truthfulness
                    elif any(word in rating for word in ["mostly true", "accurate"]):
                        ratings.append(0.85)  # Mostly true
                    elif any(word in rating for word in ["true", "correct", "accurate"]):
                        ratings.append(1.0)  # True claim
                    else:
                        ratings.append(_neutral_score())  # Default to neutral
    
    # Calculate average score if ratings exist
    if ratings:
        avg_score = sum(ratings) / len(ratings)
    else:
        avg_score = _neutral_score()  # Default to neutral

    # Labels are determined in the main endpoint, this returns raw score
    return {
        "score": avg_score,
        "label": "Processed",
        "explanation": "Credibility score calculated based on fact check reviews."
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
    fast = bool(data.get('fast'))
    
    # If a Facebook share link is supplied, resolve it to the canonical post URL first
    if url and 'facebook.com/share/' in url:
        resolved = extract_real_fb_url(url)
        if resolved:
            url = resolved
            fast = True
    
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
        # Use URL slug-based fallback to avoid empty claims list
        claims = [build_claim_from_url_slug(url)] if url else []
    
    # Limit to 5 to keep API efficient
    claims = claims[:5]
    
    # Zyla Labs primary check (choose best statement)
    primary_statement = None
    if claims:
        primary_statement = claims[0]
    else:
        # First, try to extract a key claim from the URL using heuristics
        if url:
            try:
                url_claims = extract_claims_from_url(url)
                primary_statement = select_key_claim_from_candidates(url_claims)
                if primary_statement:
                    claims.insert(0, primary_statement)
            except Exception:
                primary_statement = None
        # If still missing, try fetching raw URL content
        if not primary_statement and (content.strip().lower().startswith(('http://', 'https://')) or content.strip().lower().startswith(('url:', 'facebook url:'))):
            try:
                html = fetch_url_content(url or content)
                text = _html_to_text(html) if html else None
                primary_statement = (_safe_sent_tokenize(text or '') or [text or title or content])[0]
            except Exception:
                primary_statement = title or content
        # If still missing, build from URL slug
        if not primary_statement and url:
            primary_statement = build_claim_from_url_slug(url)
        # Last resort: use first sentence of title+content
        if not primary_statement:
            combined = f"{title}. {content}"
            primary_statement = (_safe_sent_tokenize(combined) or [combined])[0]

    # Prefer using caption/content for Facebook URLs (login-gated pages)
    if url and 'facebook.com' in url.lower() and content:
        primary_statement = content.strip() or primary_statement

    zyla_seed_text = ""
    _c = (content or "").strip()

    # PRIORITY 1: Use User Content (Raw)
    # We ignore whether it has a URL or not. If the user pasted it, we use it.
    if len(_c) >= 5:
        zyla_seed_text = _c
        print(f"DEBUG: Using User Content for Zyla: {_c[:50]}...")

    # PRIORITY 2: Scrape URL (Only if content is missing)
    elif url:
        print(f"DEBUG: No content provided. Attempting to scrape URL: {url}")
        allow_playwright = (not fast) and ('facebook.com' not in (url or '').lower())
        if allow_playwright:
            scraped_text = scrape_with_playwright(url)
            if scraped_text and len(scraped_text.strip()) > 20:
                zyla_seed_text = scraped_text
        if not zyla_seed_text:
            try:
                _claims = extract_claims_from_url(url) or []
                if _claims:
                    zyla_seed_text = ". ".join(_claims[:3])
                else:
                    zyla_seed_text = build_claim_from_url_slug(url)
            except Exception:
                zyla_seed_text = build_claim_from_url_slug(url)

    # Prepare final safe input
    zyla_safe_input = build_zyla_safe_input(zyla_seed_text)
    if not zyla_safe_input:
        try:
            if primary_statement and len(primary_statement.strip()) > 10:
                zyla_safe_input = build_zyla_safe_input(primary_statement)
            elif url:
                zyla_safe_input = build_zyla_safe_input(build_claim_from_url_slug(url))
        except Exception:
            pass
    print(f"DEBUG: Final zyla_safe_input length={len(zyla_safe_input)}")

    zyla = {}
    zyla_call_attempted = False
    
    if ZYLA_ENABLED and len(zyla_safe_input or "") > 5 and not fast:
        zyla_call_attempted = True
        zyla_raw = query_zyla_fact_check(zyla_safe_input)
        zyla = parse_zyla_response(zyla_raw)

    # Calculate domain boost early
    domain_boost = 0.0
    if url:
        # Note: calling the internal helper with underscore
        domain_boost = _credible_boost_for_url(url)
    credible_fb_bypass = bool(url and 'facebook.com' in (url or '').lower() and domain_boost > 0)

    # Containers for unified results
    all_results = []
    scores = []
    explanations = []
    sources_set = set()
    fact_checks_count = 0
    claim_analysis = []
    fake_claims = []
    real_claims = []

    # Integrate Zyla into claims sections if it returned a verdict
    if zyla.get('verdict') in {'true', 'false', 'partially_true'}:
        # Build a pseudo-claim analysis entry from Zyla
        rating_text = 'Partially True' if zyla['verdict'] == 'partially_true' else zyla['verdict'].title()
        info = {
            'claim': zyla.get('claim') or zyla_safe_input or primary_statement,
            'rating': rating_text,
            'reviewer': 'Zyla Labs',
            'title': 'Real-time Fact Check',
            'url': zyla.get('sources')[0] if zyla.get('sources') else None,
            'reviewDate': None,
            'explanation': (zyla.get('explanation') or zyla.get('analysis') or f"Verdict: {rating_text}"),
            'source': 'zyla'
        }
        claim_analysis.append(info)
        fact_checks_count += 1
        for s in zyla.get('sources') or []:
            sources_set.add(s)

        # Get confidence, default to high (0.9) if missing
        conf_val = zyla.get('confidence')
        if isinstance(conf_val, (int, float)):
            conf_val = float(conf_val)
        else:
            conf_val = 0.9

        if zyla['verdict'] == 'true':
            real_claims.append(info)
            # Force True verdict to be at least 0.8
            scores.append(max(0.8, conf_val))
        elif zyla['verdict'] == 'false':
            fake_claims.append(info)
            # Invert confidence for false
            scores.append(max(0.0, 1.0 - conf_val))
        else:  # partially_true
            real_claims.append(info)
            # Fixed score for mixed/partial
            scores.append(0.65)
            
        if zyla.get('explanation'):
            explanations.append(str(zyla['explanation']))

    run_google = not fast
    if run_google:
        google_attempted_count = 0
        google_claims_found_count = 0
        
        # Only query Google with meaningful claims; skip noisy Facebook fallbacks
        is_facebook = bool(url and 'facebook.com' in (url or '').lower())
        meaningful_claims = [c for c in claims if _is_meaningful_statement(c)]

        def _is_not_facebook_id(c: str) -> bool:
            return not re.search(r"pfbid", (c or ''), flags=re.IGNORECASE)
        meaningful_claims = [c for c in meaningful_claims if _is_not_facebook_id(c)]

        # If Facebook URL and no meaningful extracted claims, skip Google fallback entirely
        if is_facebook and not meaningful_claims:
            pass
        else:
            # Also consider using the user's primary statement if meaningful and not duplicated
            if _is_meaningful_statement(primary_statement) and primary_statement not in meaningful_claims:
                meaningful_claims.insert(0, primary_statement)

            google_attempted_count = len(meaningful_claims)
            for claim in meaningful_claims:
                result = check_claim_with_google_api(claim)
                all_results.append({
                    'claim': claim,
                    'fact_check_result': result
                })
            # Process the fact check results to calculate credibility
            for result in all_results:
                fc_result = result["fact_check_result"]
                if fc_result and "claims" in fc_result:
                    try:
                        google_claims_found_count += len(fc_result.get("claims", []))
                    except Exception:
                        pass
                    # Score/explanation
                    claim_result = calculate_credibility_score(fc_result)
                    _score = _clamp01(claim_result["score"])
                    if credible_fb_bypass and _score < _neutral_score():
                        _score = _neutral_score()
                    scores.append(_score)
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
                                'explanation': 'No fact-check reviews found for this claim.',
                                'source': 'google'
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
                                'explanation': f"{review.get('textualRating') or 'Unrated'} by {publisher or 'Unknown reviewer'}",
                                'source': 'google'
                            }
                            claim_analysis.append(info)

                            # Identify fake/misleading claims
                            if any(word in rating_text for word in [
                                'false', 'fake', 'pants on fire', 'incorrect', 'misleading', 'mostly false'
                            ]):
                                if not credible_fb_bypass:
                                    fake_claims.append(info)
                            # Identify real/true claims
                            if any(word in rating_text for word in [
                                'true', 'mostly true', 'accurate', 'correct'
                            ]):
                                real_claims.append(info)

    # Removed duplicate processing loop to prevent double entries and duplicated scores

    # Determine if Google Fact Check produced any claims
    has_google_claims = any(
        r.get('fact_check_result') and r['fact_check_result'].get('claims') for r in all_results
    ) or any((isinstance(x, dict) and x.get('source') == 'google') for x in claim_analysis)

    

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
            # Score and explanation from ML synthetic to avoid Unverified
            try:
                ml_claim_result = calculate_credibility_score(synthetic)
                scores.append(_clamp01(ml_claim_result.get('score', _neutral_score())))
                explanations.append(ml_claim_result.get('explanation', ''))
                fact_checks_count += 1
            except Exception as e:
                print(f"Failed to score ML synthetic: {e}")
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
                            'explanation': f"ML classified as {review.get('textualRating')} with confidence { (ml.get('confidence') or 0.0) * 100:.0f}%",
                            'source': 'ml'
                        }
                        claim_analysis.append(info)
                        if any(word in rating_text for word in ['false']):
                            fake_claims.append(info)
                        if any(word in rating_text for word in ['true']):
                            real_claims.append(info)
            except Exception as e:
                print(f"Failed to append ML synthetic claim: {e}")
    
    # Calculate overall credibility blending Zyla, Google, ML
    if scores:
        overall_score = sum(scores) / len(scores)
        # Track that we have fact-check data to determine labeling later
        _has_fact_data = True
        # Apply credible domain boost for borderline cases (no explicit negative evidence)
        try:
            boost = _credible_boost_for_url(url)
        except Exception:
            boost = 0.0
        has_negative_evidence = len(fake_claims) > 0
        # Floor score to low threshold for credible domains with no negative evidence
        if boost > 0 and not has_negative_evidence and overall_score < CREDIBILITY_THRESHOLDS["unverified_upper"]:
            overall_score = max(overall_score, CREDIBILITY_THRESHOLDS["unverified_upper"])
        if boost > 0 and not has_negative_evidence and (
            overall_score >= CREDIBILITY_THRESHOLDS["unverified_upper"] and overall_score < CREDIBILITY_THRESHOLDS["high"]
        ):
            overall_score = min(1.0, overall_score + boost)
            try:
                source_name = _credible_source_name(url or '')
                explanations.insert(0, f"Credible domain boost applied (+{boost:.2f}) for {source_name}.")
                if has_google_claims and credible_fb_bypass:
                    explanations.insert(1, "Detected an inaccurate Google claim review returned.")
            except Exception:
                explanations.insert(0, f"Credible domain boost applied (+{boost:.2f}).")
    else:
        # No fact check data available
        overall_score = _neutral_score()
        _has_fact_data = False
        overall_label = "Unverified"
        overall_explanation = "No fact check data available for this content."

    # Slang detection and sarcasm scoring (on combined text, with URL stripped)
    combined_text = f"{title} {content}"
    # Strip URLs from text to avoid false slang detection
    text_for_slang = re.sub(r'https?://\S+|www\.\S+', '', combined_text).strip()
    slang_found = detect_slang_words(text_for_slang)
    sarcasm_score, sarcasm_risk = compute_sarcasm_score(text_for_slang, slang_found)

    # Apply sarcasm deduction only when slang words are detected
    # Low sarcasm (<2% slang): subtract up to ~2 points; potential: subtract ~5 points
    if slang_found:
        deduction_points = 5 if sarcasm_score >= 0.02 else 2
        overall_score = max(0.0, min(1.0, overall_score - (deduction_points / 100.0)))

    # Determine overall label AFTER deductions so label matches displayed score
    if _has_fact_data:
        if overall_score >= CREDIBILITY_THRESHOLDS["high"]:
            overall_label = "CREDIBLE"
            overall_explanation = "This news appears to be factually accurate based on available fact checks."
        elif overall_score >= CREDIBILITY_THRESHOLDS["medium"]:
            overall_label = "MIXED"
            overall_explanation = "This news contains some verified information but may also have inaccuracies."
        elif overall_score >= CREDIBILITY_THRESHOLDS["unverified_lower"]:
            overall_label = "UNVERIFIED"
            overall_explanation = "Insufficient evidence; credibility cannot be confirmed based on available data."
        else:
            overall_label = "LOW CREDIBILITY"
            overall_explanation = "This news contains disputed claims or inaccuracies according to fact checkers."

        # Add specific explanations if available
        if explanations:
            overall_explanation += " Details: " + " ".join(explanations[:2])

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
        'real_claims': real_claims,
        'has_google_claims': bool(has_google_claims),
        'zyla': zyla,
        'zyla_enabled': bool(ZYLA_ENABLED),
        'zyla_attempted': bool(zyla_call_attempted),
        'zyla_input_preview': zyla_safe_input[:160],
        'zyla_debug': {
            'endpoint': ZYLA_API_URL,
            'enabled': bool(ZYLA_ENABLED),
            'attempted': bool(zyla_call_attempted),
            'input_len': len(zyla_safe_input or '')
        },
        'debug': {
            'google_attempted_count': int(locals().get('google_attempted_count', 0)),
            'google_claims_found_count': int(locals().get('google_claims_found_count', 0)),
            'scores_count': len(scores)
        },
        'ml_details': ml_details,
        'slang_detected': slang_found,
        'sarcasm_score': sarcasm_score,
        'sarcasm_percent': round(sarcasm_score * 100, 2),
        'sarcasm_risk': sarcasm_risk,
        'tone': ('Risk: Potential sarcasm may affect the meaning of the post.' if sarcasm_score >= 0.02 else 'Risk: Low – Not enough slang to indicate sarcasm.')
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
