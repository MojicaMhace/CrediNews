from __future__ import annotations
import os
import re
import time
import threading
import requests
from dotenv import load_dotenv
from apify_client import ApifyClient
from dateutil import parser as date_parser

from typing import Dict, Any, Optional
from datetime import datetime, timezone

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# -------------------------------------------------------------------------
# CONFIGURATION & ENV LOADING
# -------------------------------------------------------------------------

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
                        return val.strip().strip('"').strip("'").strip('`')
    except Exception:
        pass
    return default

load_dotenv()

APIFY_TOKEN = (
    os.getenv("APIFY_TOKEN") 
    or os.getenv("APIFY_API_TOKEN") 
    or _load_env_var("APIFY_TOKEN")
)
META_GRAPH_TOKEN = _load_env_var("META_GRAPH_TOKEN")
GRAPH_BASE_URL = (_load_env_var("GRAPH_BASE_URL", "https://graph.facebook.com/v24.0") or "https://graph.facebook.com/v24.0").strip().strip('`')
META_APP_ID = _load_env_var("META_APP_ID")
META_APP_SECRET = _load_env_var("META_APP_SECRET")
POSER_ADMIN_SECRET = _load_env_var("POSER_ADMIN_SECRET")
REQUIRED_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_read_user_content"] 

GRAPH_CACHE_TTL = int(_load_env_var("GRAPH_CACHE_TTL", "300"))
GRAPH_CACHE_MAX_ENTRIES = int(_load_env_var("GRAPH_CACHE_MAX_ENTRIES", "500"))
_GRAPH_CACHE_LOCK = threading.Lock()
GRAPH_CACHE: Dict[str, Dict[str, Any]] = {}
LAST_GRAPH_ERROR: Optional[Dict[str, Any]] = None

# -------------------------------------------------------------------------
# GRAPH API HELPERS
# -------------------------------------------------------------------------

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
                        if len(GRAPH_CACHE) > GRAPH_CACHE_MAX_ENTRIES:
                            try:
                                GRAPH_CACHE.pop(next(iter(GRAPH_CACHE)), None)
                            except Exception:
                                pass
                return data

            # Handle OAuth error immediately
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

def _debug_token_info(access_token: str) -> Dict[str, Any]:
    if not access_token or not META_APP_ID or not META_APP_SECRET: return {}
    try:
        app_token = f"{META_APP_ID}|{META_APP_SECRET}"
        resp = requests.get(f"{GRAPH_BASE_URL}/debug_token", params={"input_token": access_token, "access_token": app_token}, timeout=10)
        data = resp.json().get("data") if resp.status_code == 200 else {}
        now = datetime.now(timezone.utc)
        expires_at = data.get("expires_at")
        expires_days = None
        if expires_at:
            try:
                if int(expires_at) > 0:
                    delta = int(expires_at) - int(now.timestamp())
                    expires_days = round(delta / 86400, 2)
                else: expires_days = 99999.0
            except Exception: expires_days = None
        scopes = set(data.get("scopes") or [])
        has_required_scopes = all(s in scopes for s in REQUIRED_SCOPES)
        return {
            "is_valid": bool(data.get("is_valid")), "expires_at": expires_at,
            "expires_in_days": expires_days, "scopes": list(scopes),
            "has_required_scopes": has_required_scopes
        }
    except Exception: return {}

def _apify_health() -> Dict[str, Any]:
    try:
        if not APIFY_TOKEN:
            return {"token_loaded": False, "working": False}
        c = ApifyClient(APIFY_TOKEN)
        u = c.user().get()
        return {"token_loaded": True, "working": True, "user_id": (u or {}).get("id")}
    except Exception as e:
        return {"token_loaded": bool(APIFY_TOKEN), "working": False, "error": str(e)[:200]}

def _is_post_url(s: str) -> bool:
    try:
        from urllib.parse import urlparse, parse_qs
        u = urlparse(s or "")
        host = (u.netloc or "").lower()
        if not host: return False
        if ("facebook.com" not in host and "fb.com" not in host): return False
        path = (u.path or "")
        parts = [p for p in path.split("/") if p]
        q = parse_qs(u.query or "")
        if "story_fbid" in q or "fbid" in q: return True
        indicators = {"posts", "videos", "photos", "permalink.php", "story.php", "watch", "marketplace", "groups"}
        if any(p in indicators for p in parts): return True
        if "groups" in parts and "permalink" in parts: return True
        return False
    except Exception: return False

def is_allowed_page_or_profile_url(s: str) -> bool:
    try:
        from urllib.parse import urlparse, parse_qs
        u = urlparse(s or "")
        host = (u.netloc or "").lower()
        if not host: return False
        if ("facebook.com" not in host and "fb.com" not in host and "m.facebook.com" not in host and "mobile.facebook.com" not in host and "web.facebook.com" not in host): return False
        if _is_post_url(s): return False
        path = (u.path or "")
        parts = [p for p in path.split("/") if p]
        q = parse_qs(u.query or "")
        if "profile.php" in parts and q.get("id"): return True
        if parts and parts[0] in {"pages", "people"} and len(parts) >= 3 and re.match(r"^\d{5,}$", parts[-1] or ""): return True
        if len(parts) == 1 and re.match(r"^[A-Za-z0-9_.-]+$", parts[0]): return True
        return False
    except Exception: return False

def _normalize(value: float, min_v: float, max_v: float) -> float:
    try:
        if max_v <= min_v: return 0.0
        v = max(min_v, min(max_v, float(value)))
        rng = max_v - min_v
        return (v - min_v) / rng
    except Exception: return 0.0

def parse_url(url: str) -> Dict[str, Any]:
    try:
        from urllib.parse import urlparse
        u = urlparse((url or "").strip())
        host = (u.netloc or "").lower()
        if not host: return {"is_valid": False, "error": "Missing host"}
        if not is_allowed_page_or_profile_url(url): return {"is_valid": False, "error": "Invalid Facebook Page/Profile URL"}
        hint = "page" if "/pages/" in (u.path or "") else "profile" if "profile.php" in (u.path or "") else "unknown"
        normalized = f"https://{host}{u.path}?{u.query}".rstrip("?")
        return {"is_valid": True, "normalized_url": normalized, "type_hint": hint}
    except Exception:
        return {"is_valid": False, "error": "Invalid URL"}

def extract_fbid(url_or_id: str) -> str:
    if not url_or_id: return ""
    s = url_or_id.strip()
    if re.match(r"^[A-Za-z0-9_.-]+$", s): return s
    try:
        from urllib.parse import urlparse, parse_qs
        u = urlparse(s)
        if "facebook.com" not in (u.netloc or "") and "fb.com" not in (u.netloc or ""): return s
        qs = parse_qs(u.query or "")
        if "id" in qs and qs["id"]: return qs["id"][0]
        parts = [p for p in (u.path or "").split("/") if p]
        for p in parts:
            if re.match(r"^\d{5,}$", p): return p
        if parts: return parts[0]
    except Exception: pass
    return s

def fetch_metadata(fbid: str) -> Dict[str, Any]:
    base_fields = ["name", "link"]
    res = _graph_get(fbid, {"fields": ",".join(base_fields)}, use_cache=True)
    if _has_graph_error(res):
        return res
    if not isinstance(res, dict):
        res = {}
    optional_fields = [
        "category","about","description","fan_count","followers_count","created_time","website",
        "verification_status","is_verified"
    ]
    restricted = False
    for fld in optional_fields:
        r = _graph_get(fbid, {"fields": fld}, use_cache=True)
        if _has_graph_error(r):
            try:
                det = r.get("details") or {}
                err = det.get("error") or {}
                if int(err.get("code") or 0) == 10:
                    restricted = True
            except Exception:
                pass
        elif isinstance(r, dict) and fld in r:
            res[fld] = r.get(fld)
    pic_r = _graph_get(fbid, {"fields": "picture{url,is_silhouette}"}, use_cache=True)
    if not _has_graph_error(pic_r) and isinstance(pic_r, dict) and pic_r.get("picture"):
        res["picture"] = pic_r.get("picture")
    cover_r = _graph_get(fbid, {"fields": "cover{source}"}, use_cache=True)
    if not _has_graph_error(cover_r) and isinstance(cover_r, dict) and cover_r.get("cover"):
        res["cover"] = cover_r.get("cover")
    # Recent posts count (may require permissions; skip on error)
    posts = _graph_get(f"{fbid}/posts", {"limit": 10, "fields": "created_time"}, use_cache=True)
    posts_count = 0
    if not _has_graph_error(posts) and isinstance(posts, dict) and isinstance(posts.get("data"), list):
        posts_count = len(posts.get("data") or [])
    res["recent_posts_count"] = posts_count
    # Resource type heuristic
    if (res.get("fan_count") is not None) or res.get("category"):
        res["resource_type"] = "page"
    elif res.get("bio") or res.get("about"):
        res["resource_type"] = "profile"
    else:
        res["resource_type"] = "unknown"
    res["_permissions_restricted"] = restricted
    return res

def _parse_apify_date(s: Optional[str]) -> Optional[str]:
    try:
        if not s:
            return None
        # we use dateutil so that we can parse the date 
        dt = date_parser.parse(str(s))
        if not dt.tzinfo:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except Exception:
        return None

#para sa fallback they system use a apify so when graph api doesnt allow us to get the needed data, ai=pify will be the one to do it.
def run_apify_scraper(page_url: str) -> Optional[Dict[str, Any]]:
    try:
        token = APIFY_TOKEN
        if not token:
            print("❌ No Apify Token loaded.")
            return None
        
        client = ApifyClient(token)
        print(f"Starting Apify Scan for: {page_url}...")
        
        # Fetch last 5 posts for spam detection
        run_input = {"startUrls": [{"url": page_url}], "maxPosts": 5}
        run = client.actor("apify/facebook-pages-scraper").call(run_input=run_input)
        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            created_iso = _parse_apify_date(item.get("pageCreationDate"))
            pic_url = item.get("profilePicture")
            is_silhouette = False if pic_url else True
            verified_bool = bool(item.get("verified", False))
            cover_url = item.get("coverPhotoUrl")

            # Post analysis for Spam detection
            raw_posts = item.get("posts", [])
            recent_posts_count = len(raw_posts)
            spam_score = 0
            if recent_posts_count >= 5:
                try:
                    timestamps = []
                    for p in raw_posts:
                        if p.get("timestamp"):
                            timestamps.append(date_parser.parse(str(p.get("timestamp"))))
                    if len(timestamps) >= 5:
                        newest = max(timestamps)
                        oldest = min(timestamps)
                        diff = newest - oldest
                        # 5 posts in 1 hour -> Spam
                        if diff.total_seconds() < 3600: spam_score = -20
                        # 5 posts in 10 mins -> Bot
                        if diff.total_seconds() < 600: spam_score = -40
                except Exception: pass

            meta = {
                "id": item.get("id") or item.get("facebookId"),
                "name": item.get("name") or item.get("title"),
                "username": item.get("username"),
                "fan_count": int(item.get("likes", 0) or 0),
                "followers_count": int(item.get("followers", 0) or 0),
                "created_time": created_iso,
                "is_verified": verified_bool,
                "verification_status": "blue_verified" if verified_bool else "not_verified",
                "link": item.get("url") or page_url,
                "website": item.get("website") or item.get("pageWebsite"),
                "picture": { "data": { "is_silhouette": is_silhouette, "url": pic_url } },
                "cover": { "source": cover_url },
                "about": item.get("intro") or item.get("bio") or "",
                "recent_posts_count": recent_posts_count,
                "spam_score": spam_score,
                "resource_type": "page",
                "_apify_fallback_used": True,
                "_source": "apify"
            }
            return meta
        return None
    except Exception as e:
        print(f"Apify Error: {e}")
        return None

def _merge_apify_into_meta(graph_meta: Dict[str, Any], apify_meta: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(graph_meta or {})
    if not apify_meta:
        return merged
    for k in [
        "fan_count","followers_count","created_time","is_verified","verification_status",
        "website","link","name","id","username","about","description","picture","cover",
        "recent_posts_count","spam_score"
    ]:
        if merged.get(k) in (None, "", 0):
            v = apify_meta.get(k)
            if v not in (None, ""):
                merged[k] = v
    merged["resource_type"] = merged.get("resource_type") or apify_meta.get("resource_type") or "page"
    merged["_apify_fallback_used"] = True
    merged["_source"] = (merged.get("_source") or "graph") + "+apify"
    return merged

# -------------------------------------------------------------------------
# UPDATED SCORING LOGIC (Stricter, Zombie Page Detection REMOVED)
# -------------------------------------------------------------------------
def compute_poser_score(meta: Dict[str, Any]) -> Dict[str, Any]:
    base = 50
    layer1 = 0
    layer2 = 0
    layer3 = 0
    
    # Extract Data
    restricted = bool(meta.get("_permissions_restricted"))
    pic = ((meta.get("picture") or {}).get("data") or {})
    has_pic = bool(pic.get("url")) and not bool(pic.get("is_silhouette"))
    cover = meta.get("cover") or {}
    has_cover = bool(cover.get("source"))
    about_text = (meta.get("about") or meta.get("description") or meta.get("bio") or "").strip()
    
    followers = int(max(int(meta.get("fan_count") or 0), int(meta.get("followers_count") or 0)))
    posts_count = int(meta.get("recent_posts_count") or 0)
    
    # We still calculate this for other logic, but won't use it to punish.
    is_mega_page = followers > 1_000_000

    # LAYER 1: The Basics (Visuals)
    if has_pic: 
        layer1 += 10
    else: 
        # If it's a mega page, we forgive missing pic (might be API error)
        layer1 += 0 if (restricted or is_mega_page) else -20 

    if has_cover: 
        layer1 += 5
    else: 
        layer1 += 0 if (restricted or is_mega_page) else -10

    if about_text: 
        layer1 += 10
    else: 
        layer1 += 0 if (restricted or is_mega_page) else -10

    # LAYER 2: Verification and Follower Quality
    verified = False
    vs = (meta.get("verification_status") or "").lower()
    
    if vs == "verified" or bool(meta.get("is_verified")): 
        verified = True
    
    if verified: layer2 += 40
    
    if followers > 10000: layer2 += 20
    elif followers >= 1000: layer2 += 10
    elif followers >= 100: layer2 += 5
    elif followers < 100:
        layer2 += 0 if restricted else -10
        if followers < 10 and not restricted: layer2 -= 10

    # Age Logic
    created_time = meta.get("created_time")
    age_pts = 0
    if created_time:
        try:
            dt = datetime.fromisoformat(created_time.replace("Z","+00:00"))
            days = (datetime.now(timezone.utc) - dt).days
            if days > 365*3: age_pts = 10
            elif days >= 365: age_pts = 5
            elif days >= 90: age_pts = 0
            elif days >= 30: age_pts = -10
            else: age_pts = -20
        except: age_pts = 0
    else:
        # If Mega Page but date missing, give partial credit (assume old)
        if is_mega_page: age_pts = 5
        else: age_pts = 0 
        
    layer2 += age_pts

    # Category Bonus
    category = (meta.get("category") or "").lower()
    if any(k in category for k in ["news", "media", "public figure", "journalist"]):
        layer2 += 5
    
    # LAYER 3: Activity & Anomalies (PENALTY REMOVED)
    if posts_count >= 10: 
        layer3 += 10
    elif posts_count >= 1: 
        layer3 += 5
    else: 
        # ZOMBIE PENALTY REMOVED
        # We now treat 0 posts as Neutral (0 points)
        # This handles API failures gracefully.
        layer3 += 0

    spam_penalty = meta.get("spam_score", 0)
    layer3 += spam_penalty

    website = (meta.get("website") or "").strip()
    if website: layer3 += 5

    # Verification Paradox Check
    # Only penalize if Verified but literally ZERO followers (impossible)
    if verified and followers == 0: layer3 += 0 if restricted else -30

    # Calculate Final
    raw = base + layer1 + layer2 + layer3
    
    if raw < 0: raw = 0
    if raw > 100: raw = 100
    
    trust = raw / 100.0
    is_trustworthy = trust >= 0.60
    
    return {
        "raw_score": raw,
        "trust_score": trust,
        "is_trustworthy": is_trustworthy,
        "layers": {"layer1": layer1, "layer2": layer2, "layer3": layer3},
        "followers": followers,
        "verified": verified,
        "has_pic": has_pic,
        "has_cover": has_cover,
        "has_about": bool(about_text)
    }

def _compute_page_signals(meta: Dict[str, Any]) -> Dict[str, Any]:
    fan_count = int(meta.get("fan_count") or 0)
    followers_count = int(meta.get("followers_count") or 0)
    category = (meta.get("category") or "").lower()
    created_time = meta.get("created_time")
    website = meta.get("website") or ""
    recent_posts_count = int(meta.get("recent_posts_count") or 0)
    posting_frequency_last_30 = recent_posts_count / 30.0 if recent_posts_count else 0.0
    posting_frequency_norm = _normalize(recent_posts_count, 0, 30)
    audience = fan_count + followers_count
    if audience >= 1000000: aud_score = 15
    elif audience >= 100000: aud_score = 12
    elif audience >= 10000: aud_score = 9
    elif audience >= 1000: aud_score = 6
    elif audience >= 100: aud_score = 3
    else: aud_score = 1
    age_score = 5
    try:
        dt = datetime.fromisoformat(created_time.replace('Z','+00:00')) if created_time else None
        if dt:
            days = (datetime.utcnow() - dt.replace(tzinfo=None)).days
            if days >= 3650: age_score = 10
            elif days >= 1825: age_score = 8
            elif days >= 365: age_score = 6
            elif days >= 90: age_score = 4
            else: age_score = 2
    except Exception:
        age_score = 5
    cat_bonus = 5 if ("news" in category or "media" in category or "public figure" in category or "journalist" in category) else 0
    freq_bonus = 5 if posting_frequency_last_30 >= 0.5 else 2 if posting_frequency_last_30 > 0 else 0
    raw_total = aud_score + age_score + cat_bonus + freq_bonus
    return {
        "fan_count": fan_count,
        "followers_count": followers_count,
        "category": category,
        "created_time": created_time,
        "website": website,
        "posting_frequency_last_30": posting_frequency_last_30,
        "posting_frequency_norm": posting_frequency_norm,
        "scores": {
            "audience": aud_score,
            "page_age": age_score,
            "category_bonus": cat_bonus,
            "frequency_bonus": freq_bonus
        },
        "total_points": raw_total
    }

def _compute_poster_signals(meta: Dict[str, Any]) -> Dict[str, Any]:
    pic = ((meta.get("picture") or {}).get("data") or {})
    has_picture = bool(pic.get("url")) and not bool(pic.get("is_silhouette"))
    has_bio = bool(meta.get("bio") or meta.get("about") or meta.get("description"))
    recent_posts_count = int(meta.get("recent_posts_count") or 0)
    profile_completeness = 10 if (has_picture and has_bio) else 7 if (has_picture or has_bio) else 4
    suspicious_hits = 0  
    normal_behavior = 6  
    
    if meta.get("spam_score", 0) < 0:
        suspicious_hits = 5
        suspicious_behavior = meta.get("spam_score")
    else:
        suspicious_behavior = 0
        
    base_raw = profile_completeness + normal_behavior
    return {
        "profile_completeness": profile_completeness,
        "normal_behavior": normal_behavior,
        "suspicious_behavior": suspicious_behavior,
        "signals": {
            "has_picture": has_picture,
            "has_bio": has_bio,
            "posting_frequency_last_30": recent_posts_count / 30.0 if recent_posts_count else 0.0,
            "suspicious_hits": suspicious_hits
        },
        "total_points": base_raw
    }

def _score_to_verdict(raw_0_100: int) -> str:
    if raw_0_100 >= 60: return "Trustworthy - Credible"
    if raw_0_100 >= 40: return "Suspicious"
    return "Low Trust - Poser"

def build_response(url: str, meta: Dict[str, Any], score: Dict[str, Any], resolved_id: Optional[str] = None) -> Dict[str, Any]:
    base = {
        "input_url": url,
        "inputs": {"resolved_id": resolved_id} if resolved_id else {},
        "resource_type": meta.get("resource_type"),
        "metadata": {
            "name": meta.get("name"),
            "category": meta.get("category"),
            "fan_count": meta.get("fan_count"),
            "followers_count": meta.get("followers_count"),
            "created_time": meta.get("created_time"),
            "website": meta.get("website"),
            "link": meta.get("link"),
            "recent_posts_count": meta.get("recent_posts_count")
        },
        "trust": {
            "raw_score": score.get("raw_score"),
            "trust_score": score.get("trust_score"),
            "is_trustworthy": score.get("is_trustworthy"),
            "layers": score.get("layers")
        },
        "credi_score": int(score.get("trust_score", 0) * 100),
        "classification": _score_to_verdict(int(score.get("raw_score", 0))),
        "verdict": _score_to_verdict(int(score.get("raw_score", 0))),
        "note": (
            "Analysis used Apify Fallback; normalized for scoring"
            if meta.get("_apify_fallback_used")
            else "Analysis uses Meta Graph API" + (" (permissions restricted)" if meta.get("_permissions_restricted") else "")
        )
    }
    try:
        page_signals = _compute_page_signals(meta)
        poster_signals = _compute_poster_signals(meta)
        base["signals"] = {"page_level": page_signals, "poster_level": poster_signals}
    except Exception:
        base["signals"] = {"page_level": {"scores": {}}, "poster_level": {"signals": {}}}
    return base

def _neutral_fallback(url: str, err_details: Dict[str, Any]) -> Dict[str, Any]:
    meta = {"resource_type": "unknown", "link": url}
    score = {"raw_score": 50, "trust_score": 0.5, "is_trustworthy": False, "layers": {"layer1": 0, "layer2": 0, "layer3": 0}}
    res = build_response(url, meta, score)
    res["error"] = {"type": "permissions_required", "details": err_details}
    return res

def _require_admin_secret(data: Dict[str, Any]) -> bool:
    s = (POSER_ADMIN_SECRET or "").strip()
    if not s: return False
    return (request.headers.get("X-Admin-Secret") == s) or ((data or {}).get("admin_secret") == s)


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "status": "online", "service": "Poser Detection API", "graph_base_url": GRAPH_BASE_URL,
        "token_loaded": bool(META_GRAPH_TOKEN),
        "endpoints": {
            "/api/poser/health": "GET - Health/status",
            "/api/poser/detect": "POST - Analyze Facebook Page/Profile URL"
        }
    })

@app.route("/api/poser/health", methods=["GET"])
def poser_health():
    info = _debug_token_info(META_GRAPH_TOKEN) if META_GRAPH_TOKEN else {}
    ap = _apify_health()
    admin = _require_admin_secret({})
    return jsonify({
        "status": "ok",
        "token_loaded": bool(META_GRAPH_TOKEN),
        "graph_base_url": GRAPH_BASE_URL,
        "token_is_valid": info.get("is_valid"),
        "token_expires_in_days": info.get("expires_in_days"),
        "has_required_scopes": info.get("has_required_scopes"),
        "last_graph_error": LAST_GRAPH_ERROR,
        "apify_token_loaded": ap.get("token_loaded"),
        "apify_working": ap.get("working"),
        "apify_user_id": ap.get("user_id"),
        "apify_error": ap.get("error"),
        "admin_mode": admin,
        "graph_cache_size": len(GRAPH_CACHE) if admin else None
    })

@app.route("/api/poser/detect", methods=["POST"])
def poser_detect():
    data = request.get_json(force=True) or {}
    url = (data.get("url") or "").strip()
    if not url: return jsonify({"error": "Missing url"}), 400
    parsed = parse_url(url)
    if not parsed.get("is_valid"): return jsonify({"error": parsed.get("error")}), 400
    fbid = extract_fbid(url)
    meta = fetch_metadata(fbid)
    
    if _has_graph_error(meta):
        err = meta.get("details") or meta.get("error")
        try:
            code = (err.get("error") or {}).get("code") if isinstance(err, dict) else None
        except Exception:
            code = None
        if code == 10:
            ap_meta = run_apify_scraper(url)
            if ap_meta:
                score = compute_poser_score(ap_meta)
                res = build_response(url, ap_meta, score, resolved_id=fbid)
                return jsonify(res)
            return jsonify(_neutral_fallback(url, err)), 200
        return jsonify({"error": "Graph API error", "details": err}), 502
        
    # If restricted or audience missing, try Apify and merge
    needs_fallback = bool(meta.get("_permissions_restricted")) or (
        (meta.get("fan_count") in (None, 0)) and (meta.get("followers_count") in (None, 0))
    )
    if needs_fallback:
        ap_meta = run_apify_scraper(url)
        if ap_meta:
            meta = _merge_apify_into_meta(meta, ap_meta)
            
    score = compute_poser_score(meta)
    res = build_response(url, meta, score, resolved_id=fbid)
    return jsonify(res)

@app.route("/api/poser/analyze_full", methods=["POST"])
def poser_analyze_full():
    data = request.get_json(force=True) or {}
    url = (data.get("url") or data.get("id_or_url") or data.get("page_id") or "").strip()
    if not url: return jsonify({"error": "Missing url"}), 400
    parsed = parse_url(url)
    if not parsed.get("is_valid"): return jsonify({"error": parsed.get("error")}), 400
    fbid = extract_fbid(url)
    meta = fetch_metadata(fbid)
    
    if _has_graph_error(meta):
        err = meta.get("details") or meta.get("error")
        try:
            code = (err.get("error") or {}).get("code") if isinstance(err, dict) else None
        except Exception:
            code = None
        if code == 10:
            ap_meta = run_apify_scraper(url)
            if ap_meta:
                score = compute_poser_score(ap_meta)
                res = build_response(url, ap_meta, score, resolved_id=fbid)
                return jsonify(res)
            return jsonify(_neutral_fallback(url, err)), 200
        return jsonify({"error": "Graph API error", "details": err}), 502
        
    needs_fallback = bool(meta.get("_permissions_restricted")) or (
        (meta.get("fan_count") in (None, 0)) and (meta.get("followers_count") in (None, 0))
    )
    if needs_fallback:
        ap_meta = run_apify_scraper(url)
        if ap_meta:
            meta = _merge_apify_into_meta(meta, ap_meta)
            
    score = compute_poser_score(meta)
    res = build_response(url, meta, score, resolved_id=fbid)
    return jsonify(res)

@app.route("/api/poser/analyze_poster", methods=["POST"])
def poser_analyze_poster():
    data = request.get_json(force=True) or {}
    url = (data.get("url") or data.get("id_or_url") or "").strip()
    if not url: return jsonify({"error": "Missing url"}), 400
    parsed = parse_url(url)
    if not parsed.get("is_valid"): return jsonify({"error": parsed.get("error")}), 400
    fbid = extract_fbid(url)
    meta = fetch_metadata(fbid)
    if _has_graph_error(meta):
        err = meta.get("details") or meta.get("error")
        try:
            code = (err.get("error") or {}).get("code") if isinstance(err, dict) else None
        except Exception:
            code = None
        if code == 10:
            ap_meta = run_apify_scraper(url)
            if ap_meta:
                score = compute_poser_score(ap_meta)
                res = build_response(url, ap_meta, score, resolved_id=fbid)
                return jsonify(res)
            return jsonify(_neutral_fallback(url, err)), 200
        return jsonify({"error": "Graph API error", "details": err}), 502
    needs_fallback = bool(meta.get("_permissions_restricted")) or (
        (meta.get("fan_count") in (None, 0)) and (meta.get("followers_count") in (None, 0))
    )
    if needs_fallback:
        ap_meta = run_apify_scraper(url)
        if ap_meta:
            meta = _merge_apify_into_meta(meta, ap_meta)
    score = compute_poser_score(meta)
    res = build_response(url, meta, score, resolved_id=fbid)
    return jsonify(res)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(_load_env_var("PORT", "5001")), debug=True)