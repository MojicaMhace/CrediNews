import os
import re
import time
import requests
from typing import Dict, Any, List

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# --- Config & Helpers ---
def _load_env_var(key: str, default: str = "") -> str:
    v = os.getenv(key)
    if v:
        return v
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

META_GRAPH_TOKEN = _load_env_var('META_GRAPH_TOKEN')
GRAPH_BASE_URL = 'https://graph.facebook.com/v24.0'
META_APP_ID = _load_env_var('META_APP_ID')
META_APP_SECRET = _load_env_var('META_APP_SECRET')
REQUIRED_SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_read_user_content']
LAST_GRAPH_ERROR: Dict[str, Any] = None
GRAPH_CACHE_TTL = int(_load_env_var('GRAPH_CACHE_TTL', '300'))
GRAPH_CACHE: Dict[str, Any] = {}

def _make_cache_key(path: str, params: Dict[str, Any]) -> str:
    try:
        items = sorted((params or {}).items())
        return f"{path.strip('/')}?" + "&".join([f"{k}={v}" for k, v in items])
    except Exception:
        return path.strip('/')

def _graph_get(path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    if not META_GRAPH_TOKEN:
        return { 'error': 'Missing META_GRAPH_TOKEN' }
    params = dict(params or {})
    params['access_token'] = META_GRAPH_TOKEN
    url = f"{GRAPH_BASE_URL}/{path.strip('/')}"

    # Cache lookup
    cache_key = _make_cache_key(path, params)
    now = time.time()
    cached = GRAPH_CACHE.get(cache_key)
    if cached and cached.get('expires_at', 0) > now:
        return cached['data']

    # Retry with exponential backoff on transient errors
    attempts = 0
    backoff = 0.5
    last_error = None
    while attempts < 3:
        attempts += 1
        try:
            resp = requests.get(url, params=params, timeout=10)
            ct = (resp.headers.get('Content-Type') or '').lower()
            body = None
            try:
                body = resp.json()
            except Exception:
                body = None
            if resp.status_code == 200:
                data = body if isinstance(body, dict) else resp.json()
                # Save to cache
                GRAPH_CACHE[cache_key] = { 'data': data, 'expires_at': now + GRAPH_CACHE_TTL }
                return data

            # Decode Graph error details if present
            details = None
            if isinstance(body, dict) and 'error' in body:
                err = body.get('error') or {}
                details = {
                    'message': err.get('message'),
                    'type': err.get('type'),
                    'code': err.get('code'),
                    'error_subcode': err.get('error_subcode')
                }
                # Token invalid/expired → no retry
                if err.get('code') == 190:
                    _set_last_graph_error(status_code=resp.status_code, details=str(details))
                    return { 'error': 'OAuthException', 'details': details }
            else:
                details = resp.text

            # Retry on rate limit or server errors
            if resp.status_code in (429, 500, 502, 503):
                last_error = details
                time.sleep(backoff)
                backoff *= 2
                continue

            # Non-retryable error
            _set_last_graph_error(status_code=resp.status_code, details=str(details))
            return { 'error': f"Graph error {resp.status_code}", 'details': details }
        except Exception as e:
            last_error = str(e)
            time.sleep(backoff)
            backoff *= 2
            continue

    # Exhausted retries
    _set_last_graph_error(status_code=None, details=str(last_error))
    return { 'error': 'Graph request failed after retries', 'details': last_error }

def _has_graph_error(obj: Any) -> bool:
    try:
        return isinstance(obj, dict) and bool(obj.get('error'))
    except Exception:
        return False

def _set_last_graph_error(status_code: Any, details: str) -> None:
    """Record the last observed Graph error for health diagnostics."""
    try:
        from datetime import datetime, timezone
        ts = datetime.now(timezone.utc).isoformat()
        global LAST_GRAPH_ERROR
        LAST_GRAPH_ERROR = {
            'at': ts,
            'status_code': status_code,
            'details': details[:500]
        }
    except Exception:
        pass

def _debug_token_info(access_token: str) -> Dict[str, Any]:
    """Query Graph debug_token using app credentials (if present)."""
    if not access_token or not META_APP_ID or not META_APP_SECRET:
        return {}
    try:
        app_token = f"{META_APP_ID}|{META_APP_SECRET}"
        url = f"{GRAPH_BASE_URL}/debug_token"
        resp = requests.get(url, params={'input_token': access_token, 'access_token': app_token}, timeout=10)
        data = resp.json().get('data') if resp.status_code == 200 else {}
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        expires_at = data.get('expires_at')
        expires_days = None
        if expires_at:
            try:
                # expires_at is a UNIX timestamp (seconds)
                delta = int(expires_at) - int(now.timestamp())
                expires_days = round(delta / 86400, 2)
            except Exception:
                expires_days = None
        scopes = set(data.get('scopes') or [])
        has_required_scopes = all(s in scopes for s in REQUIRED_SCOPES)
        return {
            'is_valid': bool(data.get('is_valid')),
            'expires_at': expires_at,
            'expires_in_days': expires_days,
            'scopes': list(scopes),
            'has_required_scopes': has_required_scopes
        }
    except Exception:
        return {}

def _extract_id_from_facebook_url(url_or_id: str) -> str:
    if not url_or_id:
        return ''
    s = url_or_id.strip()
    if re.match(r"^[A-Za-z0-9_.-]+$", s):
        return s
    try:
        from urllib.parse import urlparse, parse_qs
        u = urlparse(s)
        if 'facebook.com' not in (u.netloc or ''):
            return s
        qs = parse_qs(u.query or '')
        if 'id' in qs and qs['id']:
            return qs['id'][0]
        parts = [p for p in (u.path or '').split('/') if p]
        for p in parts:
            if re.match(r"^\d{5,}$", p):
                return p
        if parts:
            return parts[0]
    except Exception:
        pass
    return s

# --- Utility: filter posts by recent days ---
def _posts_within_days(posts: List[Dict[str, Any]], days: int = 30) -> List[Dict[str, Any]]:
    try:
        from datetime import datetime, timezone, timedelta
        result: List[Dict[str, Any]] = []
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        for p in posts or []:
            ct = p.get('created_time')
            if not ct:
                continue
            try:
                dt = datetime.fromisoformat(ct.replace('Z', '+00:00'))
            except Exception:
                continue
            if dt >= cutoff:
                result.append(p)
        return result
    except Exception:
        return posts or []

# --- Normalization helper ---
def _normalize(value: float, min_v: float, max_v: float) -> float:
    try:
        if max_v <= min_v:
            return 0.0
        v = max(min_v, min(max_v, float(value)))
        rng = max_v - min_v
        return (v - min_v) / rng
    except Exception:
        return 0.0

def _load_phrase_model():
    global _PHRASE_MODEL
    if _PHRASE_MODEL is not None:
        return _PHRASE_MODEL
    if not FASTTEXT_AVAILABLE:
        return None
    for p in PHRASE_MODEL_PATHS:
        if os.path.exists(p):
            try:
                _PHRASE_MODEL = fasttext.load_model(p)
                return _PHRASE_MODEL
            except Exception:
                continue
    return None

def _classify_phrase(text: str) -> Dict[str, Any]:
    """Return {'label': 'sensational'|'factual'|'unknown', 'confidence': float}."""
    text = (text or "").strip()
    model = _load_phrase_model()
    if not model or not text:
        return {'label': 'unknown', 'confidence': 0.0}
    try:
        labels, probs = model.predict(text, k=1)
        if labels and probs:
            raw_label = labels[0] or ''
            label = raw_label.replace('__label__', '').strip().lower()
            conf = float(probs[0])
            # Normalize unexpected labels to 'unknown'
            if label not in ('sensational', 'factual'):
                label = 'unknown'
            return {'label': label, 'confidence': conf}
    except Exception:
        pass
    return {'label': 'unknown', 'confidence': 0.0}

# --- Signals computation functions (page/poster/content/external) ---
def _compute_page_signals(page: Dict[str, Any], recent_posts: List[Dict[str, Any]]) -> Dict[str, Any]:
    fan_count = int(page.get('fan_count') or 0)
    followers_count = int(page.get('followers_count') or 0)
    category = (page.get('category') or '').lower()
    created_time = page.get('created_time')
    website = page.get('website') or ''

    def _post_engagement(p):
        reactions = (((p.get('reactions') or {}).get('summary') or {}).get('total_count') or 0)
        comments = (((p.get('comments') or {}).get('summary') or {}).get('total_count') or 0)
        shares = (p.get('shares') or {}).get('count') or 0
        return int(reactions) + int(comments) + int(shares)

    posts_last_30 = _posts_within_days(recent_posts, days=30)
    engagements = [_post_engagement(p) for p in posts_last_30]
    avg_engagement = (sum(engagements) / len(engagements)) if engagements else 0.0
    # Use total audience (fan_count + followers_count) and avoid division by zero
    base_audience = max(1, fan_count + followers_count)
    engagement_rate = avg_engagement / base_audience

    audience = fan_count + followers_count
    if audience >= 1_000_000:
        aud_score = 15
    elif audience >= 100_000:
        aud_score = 12
    elif audience >= 10_000:
        aud_score = 9
    elif audience >= 1_000:
        aud_score = 6
    elif audience >= 100:
        aud_score = 3
    else:
        aud_score = 1

    age_score = 5
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(created_time.replace('Z','+00:00')) if created_time else None
        if dt:
            days = (datetime.utcnow() - dt).days
            if days >= 3650:
                age_score = 10
            elif days >= 1825:
                age_score = 8
            elif days >= 365:
                age_score = 6
            elif days >= 90:
                age_score = 4
            else:
                age_score = 2
    except Exception:
        age_score = 5

    if engagement_rate >= 0.05:
        eng_score = 10
    elif engagement_rate >= 0.02:
        eng_score = 8
    elif engagement_rate >= 0.01:
        eng_score = 6
    elif engagement_rate >= 0.005:
        eng_score = 4
    else:
        eng_score = 2 if engagements else 0

    cat_bonus = 5 if ('news' in category or 'media' in category) else 0
    raw_total = aud_score + age_score + eng_score + cat_bonus
    subscore_100 = int(round(_normalize(raw_total, 0, 40) * 100))

    return {
        'fan_count': fan_count,
        'followers_count': followers_count,
        'category': category,
        'created_time': created_time,
        'website': website,
        'posting_frequency_last_30': len(posts_last_30) / 30.0 if posts_last_30 else 0.0,
        'engagement_rate': engagement_rate,
        'scores': {
            'audience': aud_score,
            'page_age': age_score,
            'engagement_rate': eng_score,
            'category_bonus': cat_bonus
        },
        'total_points': raw_total,
        'subscore_100': subscore_100
    }

def _compute_poster_signals(profile: Dict[str, Any], recent_posts: List[Dict[str, Any]]) -> Dict[str, Any]:
    has_picture = bool((profile.get('picture') or {}).get('data'))
    has_bio = bool(profile.get('bio') or profile.get('about'))
    profile_completeness = (10 if (has_picture and has_bio) else 7 if (has_picture or has_bio) else 4)

    freq = len([p for p in (recent_posts or []) if p.get('created_time')]) / 30.0 if recent_posts else 0.0
    normal_behavior = (10 if freq >= 2.0 else 8 if freq >= 1.0 else 6 if freq >= 0.3 else 4)

    suspicious_patterns = {
        'libre', 'i-click', 'pindutin', 'i-share', 'share na', 'pa-share', 'mag-share',
        'manalo', 'papremyo', 'giveaway', 'raffle', 'gcash', 'gcash giveaway',
        'pm is the key', 'like and share', 'follow for more', 'clickbait',
        'viral ngayon', 'trending ngayon', 'kumalat'
    }
    suspicious_hits = 0
    for p in (recent_posts or []):
        msg = (p.get('message') or p.get('story') or '').lower()
        for sp in suspicious_patterns:
            if sp in msg:
                suspicious_hits += 1
                break
    suspicious_behavior = -10 if suspicious_hits >= 3 else -5 if suspicious_hits == 2 else 0

    # Base positives only (exclude penalties from raw sum)
    base_raw = profile_completeness + normal_behavior  # expected 0..20
    base_norm_100 = int(round(_normalize(base_raw, 0, 20) * 100))
    # Apply capped penalty to normalized score to avoid runaway flips
    penalty_100 = (25 if suspicious_hits >= 3 else 12 if suspicious_hits == 2 else 0)
    subscore_100 = max(0, min(100, base_norm_100 - penalty_100))

    return {
        'profile_completeness': profile_completeness,
        'normal_behavior': normal_behavior,
        'suspicious_behavior': suspicious_behavior,
        'signals': {
            'has_picture': has_picture,
            'has_bio': has_bio,
            'posting_frequency_last_30': freq,
            'suspicious_hits': suspicious_hits
        },
        'total_points': base_raw,
        'penalty_applied_100': penalty_100,
        'subscore_100': subscore_100
    }

def _compute_content_signals(post: Dict[str, Any]) -> Dict[str, Any]:
    message = (post.get('message') or post.get('story') or '')
    full_picture = post.get('full_picture')
    urls = re.findall(r"https?://\S+", message)
    sources_score = 10 if len(urls) >= 2 else 7 if len(urls) == 1 else 3
    sensational_phrases = SENSATIONAL_PHRASES
    lower = message.lower()
    # Prefer clear, concise headlines; penalize sensational phrases explicitly
    if any(t in lower for t in sensational_phrases):
        headline_score = 2
    elif len(lower) < 30:
        headline_score = 10
    elif len(lower) < 80:
        headline_score = 8
    else:
        headline_score = 4
    reverse_image_score = 10 if full_picture else 5
    raw_total = sources_score + headline_score + reverse_image_score
    # Adjust normalization range to match updated maxima (10+10+10=30)
    subscore_100 = int(round(_normalize(raw_total, 0, 30) * 100))

    return {
        'sources_score': sources_score,
        'headline_score': headline_score,
        'reverse_image_score': reverse_image_score,
        'total_points': raw_total,
        'subscore_100': subscore_100
    }

def _compute_external_checks(page: Dict[str, Any], post: Dict[str, Any]) -> Dict[str, Any]:
    website = (page or {}).get('website') or ''
    message = (post or {}).get('message') or ''
    urls = re.findall(r"https?://\S+", message)

    def _domain(u):
        try:
            from urllib.parse import urlparse
            return urlparse(u).netloc
        except Exception:
            return ''

    page_domain = _domain(website) if website else ''
    match_official = any(_domain(u) == page_domain for u in urls) if page_domain else False
    match_score = 10 if match_official else 0

    spam_patterns = {'free!!!', 'click here', 'share now', 'win money', 'giveaway'}
    spam_hit = any(sp in (message.lower()) for sp in spam_patterns)
    spam_penalty = -10 if spam_hit else 0

    flagged_penalty = 0
    try:
        fc_resp = requests.post('http://127.0.0.1:5000/api/fact-check', json={
            'title': '', 'content': message, 'url': (post.get('permalink_url') or '')
        }, timeout=10)
        if fc_resp.status_code == 200:
            data = fc_resp.json() or {}
            label = ((data.get('credibility') or {}).get('label') or '').lower()
            if label and ('low' in label or 'unverified' in label):
                flagged_penalty = -15
    except Exception:
        flagged_penalty = 0

    # Base positives only
    base_raw = match_score  # 0..10
    base_norm_100 = 100 if match_official else 50
    # Apply capped penalties to normalized score
    penalty_100 = 0
    if flagged_penalty < 0:
        penalty_100 += 30  # heavy penalty when fact-checkers flag
    if spam_penalty < 0:
        penalty_100 += 15  # moderate penalty for spam patterns
    subscore_100 = max(0, min(100, base_norm_100 - penalty_100))

    return {
        'matches_official_website': match_official,
        'match_score': match_score,
        'flagged_by_factcheckers_penalty': flagged_penalty,
        'spam_pattern_penalty': spam_penalty,
        'total_points': base_raw,
        'penalty_applied_100': penalty_100,
        'subscore_100': subscore_100
    }

def _classify_credibility(total_score_100: int, suspicious_signals: bool) -> str:
    if total_score_100 >= 80:
        return 'Trusted Source'
    if total_score_100 >= 60:
        return 'Likely Trusted'
    if total_score_100 >= 40:
        return 'Neutral / Needs Verification'
    return 'POSER / Low Credibility'

def _score_to_verdict(total_score_100: int) -> str:
    # Single source for verdict text
    if total_score_100 >= 80:
        return 'Trusted Source'
    if total_score_100 >= 60:
        return 'Likely Trusted'
    if total_score_100 >= 40:
        return 'Neutral / Needs Verification'
    return 'POSER / Low Credibility'

# --- Index / Info Routes ---
@app.route('/', methods=['GET'])
def index():
    return jsonify({
        'status': 'online',
        'service': 'Poser Detection API',
        'graph_base_url': GRAPH_BASE_URL,
        'token_loaded': bool(META_GRAPH_TOKEN),
        'endpoints': {
            '/api/poser/health': 'GET - Health/status',
            '/api/poser/analyze_full': 'POST - Analyze page/post + poster',
            '/api/poser/analyze_poster': 'POST - Analyze poster/page only',
            '/api/poser/long_lived_token': 'POST - Exchange short-lived token'
        },
        'usage': {
            'analyze_full': {
                'method': 'POST',
                'url': '/api/poser/analyze_full',
                'body': { 'url': 'https://www.facebook.com/<page_or_post_url>' }
            },
            'analyze_poster': {
                'method': 'POST',
                'url': '/api/poser/analyze_poster',
                'body': { 'id_or_url': '<facebook-id-or-url>' }
            },
            'long_lived_token': {
                'method': 'POST',
                'url': '/api/poser/long_lived_token',
                'body': {
                    'app_id': '<your-app-id>',
                    'app_secret': '<your-app-secret>',
                    'short_lived_token': '<short-lived-token>'
                }
            }
        }
    })

@app.route('/api/poser', methods=['GET'])
def poser_index():
    return index()

# --- Health endpoint ---
@app.route('/api/poser/health', methods=['GET'])
def poser_health():
    info = _debug_token_info(META_GRAPH_TOKEN) if META_GRAPH_TOKEN else {}
    return jsonify({
        'status': 'ok',
        'token_loaded': bool(META_GRAPH_TOKEN),
        'graph_base_url': GRAPH_BASE_URL,
        'token_is_valid': info.get('is_valid'),
        'token_expires_in_days': info.get('expires_in_days'),
        'has_required_scopes': info.get('has_required_scopes'),
        'last_graph_error': LAST_GRAPH_ERROR
    })

# --- Token utilities ---
@app.route('/api/poser/debug_token', methods=['POST'])
def poser_debug_token():
    """Proxy to Facebook debug_token to inspect expiry and scopes.
    Body: { app_id, app_secret, access_token }
    """
    data = request.get_json(force=True) or {}
    app_id = data.get('app_id')
    app_secret = data.get('app_secret')
    access_token = data.get('access_token')
    if not all([app_id, app_secret, access_token]):
        return jsonify({'error': 'Missing app_id, app_secret, or access_token'}), 400
    try:
        app_token = f"{app_id}|{app_secret}"
        url = f"{GRAPH_BASE_URL}/debug_token"
        resp = requests.get(url, params={'input_token': access_token, 'access_token': app_token}, timeout=10)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({'error': f'debug_token failed: {e}'}), 500

@app.route('/api/poser/set_token', methods=['POST'])
def poser_set_token():
    global META_GRAPH_TOKEN
    data = request.get_json(force=True) or {}
    new_token = (data.get('access_token') or '').strip()
    persist = bool(data.get('persist'))
    if not new_token:
        return jsonify({'error': 'Missing access_token'}), 400
    META_GRAPH_TOKEN = new_token

    updated = False
    if persist:
        try:
            env_path = os.path.join(os.path.dirname(__file__), '.env')
            lines = []
            if os.path.exists(env_path):
                with open(env_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
            found = False
            for i, line in enumerate(lines):
                if line.startswith('META_GRAPH_TOKEN='):
                    lines[i] = f"META_GRAPH_TOKEN={new_token}\n"
                    found = True
                    break
            if not found:
                lines.append(f"META_GRAPH_TOKEN={new_token}\n")
            with open(env_path, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            updated = True
        except Exception:
            updated = False
    return jsonify({'status': 'ok', 'persisted': updated, 'token_preview': f"{new_token[:6]}...{new_token[-6:]}"})

@app.route('/api/poser/page_tokens', methods=['POST'])
def poser_page_tokens():
    """List Pages and Page access tokens from a long-lived user token.
    Body: { user_access_token }
    """
    data = request.get_json(force=True) or {}
    user_token = data.get('user_access_token')
    if not user_token:
        return jsonify({'error': 'Missing user_access_token'}), 400
    try:
        url = f"{GRAPH_BASE_URL}/me/accounts"
        resp = requests.get(url, params={'access_token': user_token}, timeout=10)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({'error': f'me/accounts failed: {e}'}), 500

# --- Analyze Full (page + post + poster) ---
@app.route('/api/poser/analyze_full', methods=['POST'])
def poser_analyze_full():
    data = request.get_json(force=True) or {}
    url = (data.get('url') or '').strip()
    page_id = (data.get('page_id') or '').strip()
    post_id = (data.get('post_id') or '').strip()
    id_or_url = url or post_id or page_id
    if not id_or_url:
        return jsonify({ 'error': 'Missing url or id' }), 400
    rid = _extract_id_from_facebook_url(id_or_url)

    post_fields = ('message,story,created_time,permalink_url,full_picture,'
                   'from{id,name},comments.summary(true).limit(0),reactions.summary(true).limit(0),shares')
    post = _graph_get(rid, { 'fields': post_fields })
    is_post = bool(post.get('id')) and ('from' in post)

    page_fields = 'fan_count,followers_count,category,link,about,created_time,website,picture{url}'
    page = {}
    recent_posts = []
    if is_post:
        poster = post.get('from') or {}
        page_candidate_id = poster.get('id') or _extract_id_from_facebook_url(url)
        page = _graph_get(page_candidate_id, { 'fields': page_fields })
        posts_resp = _graph_get(f"{page_candidate_id}/posts", {
            'fields': 'id,message,story,created_time,comments.summary(true).limit(0),reactions.summary(true).limit(0),shares',
            'limit': 25
        })
        recent_posts = (posts_resp.get('data') or []) if isinstance(posts_resp, dict) else []
    else:
        page = _graph_get(rid, { 'fields': page_fields })
        posts_resp = _graph_get(f"{rid}/posts", {
            'fields': 'id,message,story,created_time,comments.summary(true).limit(0),reactions.summary(true).limit(0),shares',
            'limit': 25
        })
        recent_posts = (posts_resp.get('data') or []) if isinstance(posts_resp, dict) else []
        post = {}

    profile_fields = 'bio,about,picture.type(large){url}'
    profile = _graph_get(rid, { 'fields': profile_fields })

    # If any of the Graph calls returned an error, surface a clear API error
    graph_errors: List[Dict[str, Any]] = []
    for part in (post, page, posts_resp, profile):
        if _has_graph_error(part):
            graph_errors.append(part)
    if graph_errors:
        return jsonify({
            'status': 'error',
            'error': 'Graph API request failed',
            'graph_errors': graph_errors,
            'inputs': { 'url': url, 'resolved_id': rid }
        }), 502

    page_signals = _compute_page_signals(page, recent_posts)
    poster_signals = _compute_poster_signals(profile, recent_posts)
    content_signals = _compute_content_signals(post) if post else { 'total_points': 0, 'subscore_100': 0 }
    external_checks = _compute_external_checks(page, post)

    weights = {
        'page': 0.35,
        'poster': 0.25,
        'content': 0.25,
        'external': 0.15
    }
    total100 = (
        (page_signals.get('subscore_100') or 0) * weights['page'] +
        (poster_signals.get('subscore_100') or 0) * weights['poster'] +
        (content_signals.get('subscore_100') or 0) * weights['content'] +
        (external_checks.get('subscore_100') or 0) * weights['external']
    )
    credi_score = int(round(total100))
    suspicious = (poster_signals.get('suspicious_behavior') or 0) < 0
    classification = _classify_credibility(credi_score, suspicious)
    verdict = _score_to_verdict(credi_score)
    return jsonify({
        'status': 'success',
        'inputs': { 'url': url, 'resolved_id': rid },
        'page': page,
        'post': post,
        'profile': profile,
        'signals': {
            'page_level': page_signals,
            'poster_level': poster_signals,
            'content_level': content_signals,
            'external_checks': external_checks
        },
        'credi_score': credi_score,
        'classification': classification,
        'verdict': verdict
    })

# --- Analyze Poster only ---
@app.route('/api/poser/analyze_poster', methods=['POST'])
def poser_analyze_poster():
    data = request.get_json(force=True) or {}
    id_or_url = (data.get('id_or_url') or data.get('url') or '').strip()
    if not id_or_url:
        return jsonify({ 'error': 'Missing id_or_url' }), 400
    rid = _extract_id_from_facebook_url(id_or_url)

    profile_fields = 'bio,about,picture.type(large){url},fan_count,followers_count'
    profile = _graph_get(rid, { 'fields': profile_fields })
    posts_resp = _graph_get(f"{rid}/posts", {
        'fields': 'id,message,story,created_time',
        'limit': 25
    })
    recent_posts = (posts_resp.get('data') or []) if isinstance(posts_resp, dict) else []

    poster_signals = _compute_poster_signals(profile, recent_posts)
    credi_score = int(round((poster_signals.get('subscore_100') or 0)))
    classification = _classify_credibility(credi_score, False)
    verdict = _score_to_verdict(credi_score)
    return jsonify({
        'status': 'success',
        'poster_id': rid,
        'profile': profile,
        'recent_posts_count': len(recent_posts),
        'poster_signals': poster_signals,
        'credi_score': credi_score,
        'classification': classification,
        'verdict': verdict
    })

# --- Long-lived token endpoint ---
@app.route('/api/poser/long_lived_token', methods=['POST'])
def long_lived_token():
    data = request.get_json(force=True) or {}
    app_id = data.get('app_id')
    app_secret = data.get('app_secret')
    short_lived_token = data.get('short_lived_token')

    if not all([app_id, app_secret, short_lived_token]):
        return jsonify({'error': 'Missing app_id, app_secret, or short_lived_token'}), 400

    url = "https://graph.facebook.com/v24.0/oauth/access_token"
    params = {
        "grant_type": "fb_exchange_token",
        "client_id": app_id,
        "client_secret": app_secret,
        "fb_exchange_token": short_lived_token
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()

        if resp.status_code != 200 or "error" in data:
            return jsonify({'error': data.get('error', 'Unknown error')}), 400

        return jsonify({
            "access_token": data.get("access_token"),
            "expires_in": data.get("expires_in")
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Run Server ---
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)

import os
import re
import time
import requests
from typing import Dict, Any, List

try:
    import fasttext
    FASTTEXT_AVAILABLE = True
except Exception:
    FASTTEXT_AVAILABLE = False

# Sensational phrase cues (used for headline scoring)
SENSATIONAL_PHRASES = {
    'grabe', 'nakakagulat', 'nakaka-shock', 'nagulat ang lahat',
    'hindi mo aakalain', 'di mo inaasahan',
    'ito ang dahilan', 'ito ang nangyari',
    'di ka makapaniwala', 'nakakabahala',
    'kumalat', 'trending ngayon', 'viral ngayon',
    'binasag', 'binweltahan', 'sinupalpal',
    'nag-walk out', 'nagwala', 'kinabahan',
    'umamin', 'naglabas ng statement',
    'luh', 'patay', 'kabog'
}

PHRASE_MODEL_PATHS = [
    os.path.join(os.path.dirname(__file__), 'filipino_phrases.bin'),
]
_PHRASE_MODEL = None
