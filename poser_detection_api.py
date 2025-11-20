from __future__ import annotations
import os
import re
import time
import json
import threading
import requests

from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone, timedelta

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

def _load_env_var(key: str, default: str = "") -> str:
    v = os.getenv(key)
    if v:
        return v
    try:
        env_path = os.path.join(os.path.dirname(__file__), ".env")
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or '=' not in line:
                        continue
                    k, val = line.split("=", 1)
                    if k.strip() == key:
                        return val.strip().strip('"').strip("'")
    except Exception:
        pass
    return default

META_GRAPH_TOKEN = _load_env_var("META_GRAPH_TOKEN")
GRAPH_BASE_URL = _load_env_var("GRAPH_BASE_URL", "https://graph.facebook.com/v24.0")
META_APP_ID = _load_env_var("META_APP_ID")
META_APP_SECRET = _load_env_var("META_APP_SECRET")
POSER_ADMIN_SECRET = _load_env_var("POSER_ADMIN_SECRET")
REQUIRED_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_read_user_content"]
GRAPH_CACHE_TTL = int(_load_env_var("GRAPH_CACHE_TTL", "300"))
GRAPH_CACHE_MAX_ENTRIES = int(_load_env_var("GRAPH_CACHE_MAX_ENTRIES", "500"))
_GRAPH_CACHE_LOCK = threading.Lock()
GRAPH_CACHE: Dict[str, Dict[str, Any]] = {}
LAST_GRAPH_ERROR: Optional[Dict[str, Any]] = None

def _make_cache_key(path: str, params: Optional[Dict[str, Any]]) -> str:
    try:
        items = sorted(((params or {}).items()))
        return f"{path.strip('/')}?" + "&".join([f"{k}={v}" for k, v in items])
    except Exception:
        return path.strip("/")

def _set_last_graph_error(status_code: Any, details: str) -> None:
    global LAST_GRAPH_ERROR
    try:
        LAST_GRAPH_ERROR = {
            "at": datetime.now(timezone.utc).isoformat(),
            "status_code": status_code,
            "details": (details or "")[:500]
        }
    except Exception:
        pass

def _graph_get(path: str, params: Optional[Dict[str, Any]] = None, use_cache: bool = True) -> Dict[str, Any]:
    """
    Robust Graph GET with caching, retries, and error recording.
    Requires META_GRAPH_TOKEN to be set.
    """
    if not META_GRAPH_TOKEN:
        return {"error": "Missing META_GRAPH_TOKEN"}

    params = dict(params or {})
    params["access_token"] = META_GRAPH_TOKEN
    url = f"{GRAPH_BASE_URL}/{path.strip('/')}"

    cache_key = _make_cache_key(path, params)
    now_ts = time.time()
    if use_cache:
        with _GRAPH_CACHE_LOCK:
            cached = GRAPH_CACHE.get(cache_key)
            if cached and cached.get("expires_at", 0) > now_ts:
                return cached["data"]

    attempts = 0
    backoff = 0.5
    last_error = None
    while attempts < 3:
        attempts += 1
        try:
            resp = requests.get(url, params=params, timeout=10)
            try:
                body = resp.json()
            except Exception:
                body = None

            if resp.status_code == 200:
                data = body if isinstance(body, dict) else body or {}
                if use_cache:
                    with _GRAPH_CACHE_LOCK:
                        GRAPH_CACHE[cache_key] = {"data": data, "expires_at": now_ts + GRAPH_CACHE_TTL}
                        # simple eviction
                        if len(GRAPH_CACHE) > GRAPH_CACHE_MAX_ENTRIES:
                            try:
                                GRAPH_CACHE.pop(next(iter(GRAPH_CACHE)), None)
                            except Exception:
                                pass
                return data

            # handle OAuth error immediately
            if isinstance(body, dict) and "error" in body:
                err = body.get("error") or {}
                details = {
                    "message": err.get("message"),
                    "type": err.get("type"),
                    "code": err.get("code"),
                    "error_subcode": err.get("error_subcode")
                }
                if err.get("code") == 190:
                    _set_last_graph_error(resp.status_code, str(details))
                    return {"error": "OAuthException", "details": details}

            # transient server errors: retry
            if resp.status_code in (429, 500, 502, 503):
                last_error = body or resp.text
                time.sleep(backoff)
                backoff *= 2
                continue

            _set_last_graph_error(resp.status_code, str(body or resp.text))
            return {"error": f"Graph error {resp.status_code}", "details": body or resp.text}

        except Exception as e:
            last_error = str(e)
            time.sleep(backoff)
            backoff *= 2
            continue

    _set_last_graph_error(None, str(last_error))
    return {"error": "Graph request failed after retries", "details": last_error}

def _has_graph_error(obj: Any) -> bool:
    return isinstance(obj, dict) and bool(obj.get("error"))

# -----------------------
# Helpers (text/date)
# -----------------------
def _extract_id_from_facebook_url(url_or_id: str) -> str:
    if not url_or_id:
        return ""
    s = url_or_id.strip()
    if re.match(r"^[A-Za-z0-9_.-]+$", s):
        return s
    try:
        from urllib.parse import urlparse, parse_qs
        u = urlparse(s)
        if "facebook.com" not in (u.netloc or ""):
            return s
        qs = parse_qs(u.query or "")
        if "id" in qs and qs["id"]:
            return qs["id"][0]
        parts = [p for p in (u.path or "").split("/") if p]
        for p in parts:
            if re.match(r"^\d{5,}$", p):
                return p
        if parts:
            return parts[0]
    except Exception:
        pass
    return s

def _normalize_text_multilang(text: str) -> str:
    t = (text or "").lower()
    t = re.sub(r"\s+", " ", t)
    return t.strip()

def _is_post_url(s: str) -> bool:
    try:
        from urllib.parse import urlparse, parse_qs
        u = urlparse(s or "")
        host = (u.netloc or "").lower()
        if not host:
            return False
        if ("facebook.com" not in host and "fb.com" not in host):
            return False
        path = (u.path or "")
        parts = [p for p in path.split("/") if p]
        q = parse_qs(u.query or "")
        if "story_fbid" in q or "fbid" in q:
            return True
        indicators = {"posts", "videos", "photos", "permalink.php", "story.php", "watch"}
        if any(p in indicators for p in parts):
            return True
        if "groups" in parts and "permalink" in parts:
            return True
        return False
    except Exception:
        return False

def is_allowed_page_or_profile_url(s: str) -> bool:
    try:
        from urllib.parse import urlparse, parse_qs
        u = urlparse(s or "")
        host = (u.netloc or "").lower()
        if not host:
            return False
        if ("facebook.com" not in host and "fb.com" not in host):
            return False
        if _is_post_url(s):
            return False
        path = (u.path or "")
        parts = [p for p in path.split("/") if p]
        q = parse_qs(u.query or "")
        if "profile.php" in parts and q.get("id"):
            return True
        if parts and parts[0] in {"pages", "people"} and len(parts) >= 3 and re.match(r"^\d{5,}$", parts[-1] or ""):
            return True
        if len(parts) == 1 and re.match(r"^[A-Za-z0-9_.-]+$", parts[0]):
            return True
        return False
    except Exception:
        return False

def _posts_within_days(posts: List[Dict[str, Any]], days: int = 30) -> List[Dict[str, Any]]:
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        result: List[Dict[str, Any]] = []
        for p in posts or []:
            ct = p.get("created_time")
            if not ct:
                continue
            try:
                dt = datetime.fromisoformat(ct.replace("Z", "+00:00"))
            except Exception:
                continue
            if dt >= cutoff:
                result.append(p)
        return result
    except Exception:
        return posts or []

def _normalize(value: float, min_v: float, max_v: float) -> float:
    try:
        if max_v <= min_v:
            return 0.0
        v = max(min_v, min(max_v, float(value)))
        rng = max_v - min_v
        return (v - min_v) / rng
    except Exception:
        return 0.0

#comment based

# Score poser pag 39 and below, suspicios pag 40 - 59 then verified pag 60 pataas
def _compute_page_signals(page: Dict[str, Any], recent_posts: List[Dict[str, Any]]) -> Dict[str, Any]:
    fan_count = int(page.get("fan_count") or 0)
    followers_count = int(page.get("followers_count") or 0)
    category = (page.get("category") or "").lower()
    created_time = page.get("created_time")
    website = page.get("website") or ""

    # engagement per post
    def _post_engagement(p: Dict[str, Any]) -> int:
        try:
            reactions = (((p.get("reactions") or {}).get("summary") or {}).get("total_count") or 0)
            comments = (((p.get("comments") or {}).get("summary") or {}).get("total_count") or 0)
            shares = (p.get("shares") or {}).get("count") or 0
            return int(reactions) + int(comments) + int(shares)
        except Exception:
            return 0

    posts_last_30 = _posts_within_days(recent_posts, days=30)
    engagements = [_post_engagement(p) for p in posts_last_30]
    avg_engagement = (sum(engagements) / len(engagements)) if engagements else 0.0
    base_audience = max(1, fan_count + followers_count)
    engagement_rate = avg_engagement / base_audience

    msgs = [ _normalize_text_multilang((p.get("message") or p.get("story") or "")) for p in posts_last_30 ]
    seen = set()
    dup = 0
    for m in msgs:
        if m in seen:
            dup += 1
        else:
            seen.add(m)
    repeated_message_ratio = (dup / max(1, len(msgs))) if msgs else 0.0

    domains = []
    for p in posts_last_30:
        for u in re.findall(r"https?://\S+", (p.get("message") or p.get("story") or "")):
            try:
                from urllib.parse import urlparse
                domains.append(urlparse(u).netloc)
            except Exception:
                continue
    unique_domains = len(set(domains))
    domain_diversity_ratio = (unique_domains / max(1, len(domains))) if domains else 0.0

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
        "fan_count": fan_count,
        "followers_count": followers_count,
        "category": category,
        "created_time": created_time,
        "website": website,
        "posting_frequency_last_30": len(posts_last_30) / 30.0 if posts_last_30 else 0.0,
        "engagement_rate": engagement_rate,
        "scores": {
            "audience": aud_score,
            "page_age": age_score,
            "engagement_rate": eng_score,
            "category_bonus": cat_bonus
        },
        "signals": {
            "repeated_message_ratio": repeated_message_ratio,
            "domain_diversity_ratio": domain_diversity_ratio
        },
        "total_points": raw_total,
        "subscore_100": subscore_100
    }

def _compute_poster_signals(profile: Dict[str, Any], recent_posts: List[Dict[str, Any]]) -> Dict[str, Any]:
    has_picture = bool((profile.get("picture") or {}).get("data"))
    has_bio = bool(profile.get("bio") or profile.get("about"))
    profile_completeness = (10 if (has_picture and has_bio) else 7 if (has_picture or has_bio) else 4)

    freq = len([p for p in (recent_posts or []) if p.get("created_time")]) / 30.0 if recent_posts else 0.0
    normal_behavior = (10 if freq >= 2.0 else 8 if freq >= 1.0 else 6 if freq >= 0.3 else 4)

    suspicious_patterns = {
        'libre', 'i-click', 'pindutin', 'i-share', 'share na', 'pa-share', 'mag-share',
        'manalo', 'papremyo', 'giveaway', 'raffle', 'gcash', 'gcash giveaway',
        'pm is the key', 'like and share', 'follow for more', 'clickbait',
        'viral ngayon', 'trending ngayon', 'kumalat'
    }
    suspicious_hits = 0
    for p in (recent_posts or []):
        msg = (p.get("message") or p.get("story") or "").lower()
        for sp in suspicious_patterns:
            if sp in msg:
                suspicious_hits += 1
                break
    suspicious_behavior = -10 if suspicious_hits >= 3 else -5 if suspicious_hits == 2 else 0

    base_raw = profile_completeness + normal_behavior
    base_norm_100 = int(round(_normalize(base_raw, 0, 20) * 100))
    penalty_100 = (25 if suspicious_hits >= 3 else 12 if suspicious_hits == 2 else 0)
    subscore_100 = max(0, min(100, base_norm_100 - penalty_100))

    return {
        "profile_completeness": profile_completeness,
        "normal_behavior": normal_behavior,
        "suspicious_behavior": suspicious_behavior,
        "signals": {
            "has_picture": has_picture,
            "has_bio": has_bio,
            "posting_frequency_last_30": freq,
            "suspicious_hits": suspicious_hits
        },
        "total_points": base_raw,
        "penalty_applied_100": penalty_100,
        "subscore_100": subscore_100
    }



def _score_to_verdict(total_score_100: int) -> str:
    if total_score_100 >= 60:
        return "Verified"
    if total_score_100 >= 40:
        return "Suspicious"
    return "Poser"

def _build_rationale(page_s: Dict[str, Any], poster_s: Dict[str, Any], content_s: Dict[str, Any], external_s: Dict[str, Any]) -> Dict[str, Any]:
    positives: List[str] = []
    negatives: List[str] = []

    if (page_s.get("scores") or {}).get("audience", 0) >= 12:
        positives.append("large audience")
    if (page_s.get("scores") or {}).get("page_age", 0) >= 8:
        positives.append("older page")
    if (poster_s.get("signals") or {}).get("suspicious_hits", 0) >= 2:
        negatives.append("multiple suspicious phrases")

    summary = "verified" if len(negatives) == 0 and len(positives) > 0 else "mixed" if positives and negatives else "risky"
    return {"positives": positives, "negatives": negatives, "summary": summary}

# Endpoints
@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "status": "online",
        "service": "Poser Detection API",
        "graph_base_url": GRAPH_BASE_URL,
        "token_loaded": bool(META_GRAPH_TOKEN),
        "endpoints": {
            "/api/poser/health": "GET - Health/status",
            "/api/poser/analyze_full": "POST - Analyze page/user",
            "/api/poser/analyze_poster": "POST - Analyze poster/page only",
            "/api/poser/long_lived_token": "POST - Exchange short-lived token",
            "/api/poser/set_token": "POST - set META_GRAPH_TOKEN (admin)"
        }
    })

@app.route("/api/poser", methods=["GET"])
def poser_index():
    return index()

@app.route("/api/poser/health", methods=["GET"])
def poser_health():
    info = _debug_token_info(META_GRAPH_TOKEN) if META_GRAPH_TOKEN else {}
    return jsonify({
        "status": "ok",
        "token_loaded": bool(META_GRAPH_TOKEN),
        "graph_base_url": GRAPH_BASE_URL,
        "token_is_valid": info.get("is_valid"),
        "token_expires_in_days": info.get("expires_in_days"),
        "has_required_scopes": info.get("has_required_scopes"),
        "last_graph_error": LAST_GRAPH_ERROR
    })

@app.route("/api/poser/debug_token", methods=["POST"])
def poser_debug_token():
    data = request.get_json(force=True) or {}
    if not _require_admin_secret(data):
        return jsonify({"error": "forbidden"}), 403
    app_id = data.get("app_id")
    app_secret = data.get("app_secret")
    access_token = data.get("access_token")
    if not all([app_id, app_secret, access_token]):
        return jsonify({"error": "Missing app_id, app_secret, or access_token"}), 400
    try:
        app_token = f"{app_id}|{app_secret}"
        resp = requests.get(f"{GRAPH_BASE_URL}/debug_token", params={"input_token": access_token, "access_token": app_token}, timeout=10)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({"error": f"debug_token failed: {e}"}), 500

@app.route("/api/poser/set_token", methods=["POST"])
def poser_set_token():
    global META_GRAPH_TOKEN
    data = request.get_json(force=True) or {}
    if not _require_admin_secret(data):
        return jsonify({"error": "forbidden"}), 403
    new_token = (data.get("access_token") or "").strip()
    if not new_token:
        return jsonify({"error": "Missing access_token"}), 400

    exchanged = False
    try:
        info = _debug_token_info(new_token) or {}
        expires_days = info.get("expires_in_days")
        if META_APP_ID and META_APP_SECRET and (expires_days is None or float(expires_days or 0) < 30):
            resp = requests.get(
                f"{GRAPH_BASE_URL}/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": META_APP_ID,
                    "client_secret": META_APP_SECRET,
                    "fb_exchange_token": new_token
                },
                timeout=10
            )
            data_ex = resp.json() if resp.status_code == 200 else {}
            long_token = data_ex.get("access_token")
            if long_token:
                new_token = long_token
                exchanged = True
    except Exception:
        pass

    META_GRAPH_TOKEN = new_token

    persisted = False
    persist = bool(data.get("persist")) or exchanged
    if persist:
        try:
            env_path = os.path.join(os.path.dirname(__file__), ".env")
            lines = []
            if os.path.exists(env_path):
                with open(env_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()
            found = False
            for i, line in enumerate(lines):
                if line.startswith("META_GRAPH_TOKEN="):
                    lines[i] = f"META_GRAPH_TOKEN={new_token}\n"
                    found = True
                    break
            if not found:
                lines.append(f"META_GRAPH_TOKEN={new_token}\n")
            with open(env_path, "w", encoding="utf-8") as f:
                f.writelines(lines)
            persisted = True
        except Exception:
            persisted = False

    return jsonify({"status": "ok", "persisted": persisted, "token_preview": f"{new_token[:6]}...{new_token[-6:]}"})


@app.route("/api/poser/page_tokens", methods=["POST"])
def poser_page_tokens():
    data = request.get_json(force=True) or {}
    if not _require_admin_secret(data):
        return jsonify({"error": "forbidden"}), 403
    user_token = data.get("user_access_token")
    if not user_token:
        return jsonify({"error": "Missing user_access_token"}), 400
    try:
        resp = requests.get(f"{GRAPH_BASE_URL}/me/accounts", params={"access_token": user_token}, timeout=10)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({"error": f"me/accounts failed: {e}"}), 500

@app.route("/api/poser/analyze_full", methods=["POST"])
def poser_analyze_full():
    data = request.get_json(force=True) or {}
    url = (data.get("url") or "").strip()
    page_id = (data.get("page_id") or "").strip()
    id_or_url = url or page_id or (data.get("id_or_url") or "").strip()
    if not id_or_url:
        return jsonify({"error": "Missing url or id"}), 400

    try:
        from urllib.parse import urlparse
        if url:
            u = urlparse(url)
            host = (u.netloc or '').lower()
            if host and ('facebook.com' not in host and 'fb.com' not in host):
                return jsonify({"error": "Invalid URL. Provide a Facebook page/profile URL or ID."}), 400
            if _is_post_url(url):
                return jsonify({"error": "Post URLs are not allowed. Provide a page/profile link."}), 400
            if not is_allowed_page_or_profile_url(url):
                return jsonify({"error": "The link must be a Facebook Page or User profile URL only."}), 400
    except Exception:
        pass

    rid = _extract_id_from_facebook_url(id_or_url)

    page_fields = "fan_count,followers_count,category,link,about,created_time,website,picture{url}"
    page = _graph_get(rid, {"fields": page_fields})
    posts_resp = _graph_get(f"{rid}/posts", {"fields": "id,message,story,created_time", "limit": 25})
    recent_posts = (posts_resp.get("data") or []) if isinstance(posts_resp, dict) else []
    post = {}

    profile_fields = "bio,about,picture.type(large){url}"
    profile = _graph_get(rid, {"fields": profile_fields})

    graph_errors: List[Dict[str, Any]] = []
    for part in (page, posts_resp, profile):
        if _has_graph_error(part):
            graph_errors.append(part)
    if graph_errors:
        return jsonify({
            "status": "error",
            "error": "Graph API request failed",
            "graph_errors": graph_errors,
            "inputs": {"url": url, "resolved_id": rid}
        }), 502

    page_signals = _compute_page_signals(page, recent_posts)
    poster_signals = _compute_poster_signals(profile, recent_posts)

    weights = {"page": 0.6, "poster": 0.4}
    total100 = (
        (page_signals.get("subscore_100") or 0) * weights["page"] +
        (poster_signals.get("subscore_100") or 0) * weights["poster"]
    )
    credi_score = int(round(total100))
    verdict = _score_to_verdict(credi_score)
    rationale = _build_rationale(page_signals, poster_signals, {}, {})

    return jsonify({
        "status": "success",
        "inputs": {"url": url, "resolved_id": rid},
        "page": page,
        "post": post,
        "profile": profile,
        "signals": {"page_level": page_signals, "poster_level": poster_signals},
        "credi_score": credi_score,
        "classification": verdict,
        "verdict": verdict,
        "rationale": rationale
    })

@app.route("/api/poser/analyze_poster", methods=["POST"])
def poser_analyze_poster():
    data = request.get_json(force=True) or {}
    id_or_url = (data.get("id_or_url") or data.get("url") or "").strip()
    if not id_or_url:
        return jsonify({"error": "Missing id_or_url"}), 400
    s = id_or_url
    try:
        from urllib.parse import urlparse
        u = urlparse(s)
        host = (u.netloc or '').lower()
        if host and ('facebook.com' not in host and 'fb.com' not in host):
            return jsonify({"error": "Invalid URL. Provide a Facebook page/profile URL or ID."}), 400
        if host and _is_post_url(s):
            return jsonify({"error": "Post URLs are not allowed. Provide a page/profile link."}), 400
        if host and not is_allowed_page_or_profile_url(s):
            return jsonify({"error": "The link must be a Facebook Page or User profile URL only."}), 400
    except Exception:
        pass
    rid = _extract_id_from_facebook_url(id_or_url)

    profile_fields = "bio,about,picture.type(large){url},fan_count,followers_count"
    profile = _graph_get(rid, {"fields": profile_fields})
    posts_resp = _graph_get(f"{rid}/posts", {"fields": "id,message,story,created_time", "limit": 25})
    recent_posts = (posts_resp.get("data") or []) if isinstance(posts_resp, dict) else []

    poster_signals = _compute_poster_signals(profile, recent_posts)
    credi_score = int(round((poster_signals.get("subscore_100") or 0)))
    verdict = _score_to_verdict(credi_score)

    return jsonify({
        "status": "success",
        "poster_id": rid,
        "profile": profile,
        "recent_posts_count": len(recent_posts),
        "poster_signals": poster_signals,
        "credi_score": credi_score,
        "classification": verdict,
        "verdict": verdict
    })

@app.route("/api/poser/long_lived_token", methods=["POST"])
def long_lived_token():
    data = request.get_json(force=True) or {}
    if not _require_admin_secret(data):
        return jsonify({"error": "forbidden"}), 403
    app_id = data.get("app_id")
    app_secret = data.get("app_secret")
    short_lived_token = data.get("short_lived_token")
    if not all([app_id, app_secret, short_lived_token]):
        return jsonify({"error": "Missing app_id, app_secret, or short_lived_token"}), 400
    try:
        resp = requests.get(
            f"{GRAPH_BASE_URL}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": app_id,
                "client_secret": app_secret,
                "fb_exchange_token": short_lived_token
            },
            timeout=10
        )
        data = resp.json()
        if resp.status_code != 200 or "error" in data:
            return jsonify({"error": data.get("error", "Unknown error")}), 400
        return jsonify({
            "access_token": data.get("access_token"),
            "expires_in": data.get("expires_in")
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _debug_token_info(access_token: str) -> Dict[str, Any]:
    if not access_token or not META_APP_ID or not META_APP_SECRET:
        return {}
    try:
        app_token = f"{META_APP_ID}|{META_APP_SECRET}"
        resp = requests.get(f"{GRAPH_BASE_URL}/debug_token", params={"input_token": access_token, "access_token": app_token}, timeout=10)
        data = resp.json().get("data") if resp.status_code == 200 else {}
        now = datetime.now(timezone.utc)
        expires_at = data.get("expires_at")
        expires_days = None
        if expires_at:
            try:
                delta = int(expires_at) - int(now.timestamp())
                expires_days = round(delta / 86400, 2)
            except Exception:
                expires_days = None
        scopes = set(data.get("scopes") or [])
        has_required_scopes = all(s in scopes for s in REQUIRED_SCOPES)
        return {
            "is_valid": bool(data.get("is_valid")),
            "expires_at": expires_at,
            "expires_in_days": expires_days,
            "scopes": list(scopes),
            "has_required_scopes": has_required_scopes
        }
    except Exception:
        return {}

def _require_admin_secret(data: Dict[str, Any]) -> bool:
    s = (POSER_ADMIN_SECRET or "").strip()
    if not s:
        return False
    return (request.headers.get("X-Admin-Secret") == s) or ((data or {}).get("admin_secret") == s)
# Run server
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(_load_env_var("PORT", "5001")), debug=True)

