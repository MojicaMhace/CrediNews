# IncrediNews — Data Flow Diagram (DFD) Level 1

## External Entities
- User (Journalist/Reader)
- Facebook Platform (Pages, Posts)
- Meta Graph API
- Google Fact Check Tools API
- Apify Scraper
- Groq AI Service
- Zyla Fact Check API

## Processes
- P1 crediNews Frontend (includes Verify Facebook News)
- P2 Fact Check API
- P3 Poser Detection API
- P4 Trends Dashboard
- P5 Reports Dashboard
- P6 My Verifications
- P7 Poser History

## Data Stores (Firestore Collections)
- DS1 crediNews.verification_results
- DS2 crediNews.facebook_verification_results
- DS3 crediNews.facebook_verification_requests
- DS4 crediNews.pending_verifications
- DS5 crediNews.user_feedback
- DS6 crediNews.login_sessions
- DS7 crediNews.users
- DS8 crediNews.analyzed_pages_cache
- DS9 crediNews.poser_detections
- DS10 crediNews.verified_registry
- DS11 crediNews.account_activity
- DS12 crediNews.facebook_verification_results.votes (subcollection)

## Flows
- User → P1: Verify Facebook News
- P1 → P2: Verify text/URL request
- P2 → Meta Graph API: Fetch page HTML or related signals
- P2 → Google Fact Check Tools API: Query claim reviews
- P2 → Zyla Fact Check API: Supplemental claim analysis
- P2 → Apify Scraper: Fallback scrape for public signals
- Meta Graph API → P2: Page/content data
- Google Fact Check Tools API → P2: Claim review data
- Zyla Fact Check API → P2: Claim analysis data
- Apify Scraper → P2: Public page/content data
- P2 → DS1: Store credibility results
- P2 → DS2: Store Facebook verification results
- P2 → DS3: Store verification requests
- P2 → DS4: Queue pending manual verifications
- P1 → P3: Run poser detection on Facebook page
- P3 → Meta Graph API: Fetch page metadata
- P3 → Apify Scraper: Fallback page metadata
- P3 → Groq AI Service: AI analysis (JSON-only)
- Meta Graph API → P3: Page metadata
- Apify Scraper → P3: Public metadata
- Groq AI Service → P3: AI trust/analysis
- P3 → DS8: Cache analyzed page metadata
- P3 → DS9: Store poser verdicts
- P3 ↔ DS10: Check verified registry and apply verified status
- P4 ← DS2: Read verified results for Trends
- P5 ← DS2: Read verified results for Reports
- P6 ↔ DS2: Read/write user’s verification results; update feedback
- P6 → DS12: Write votes; DS2.feedback is updated via transactions
- P7 ← DS9: Read poser detections; filter by user
- P7 → DS9: Soft/hard delete entries
- P7 → DS11: Log account activity (delete actions)
- P1 ← DS1/DS2/DS9: Render results (credibility, poser verdicts)

## Level 1 Diagram (Mermaid)
```mermaid
flowchart TB 
     %% Styling 
     classDef process fill:#e1f5fe,stroke:#01579b,stroke-width:2px; 
     classDef store fill:#fff9c4,stroke:#fbc02d,stroke-width:2px; 
     classDef external fill:#e0e0e0,stroke:#616161,stroke-width:2px; 
 
     %% External Entities 
     subgraph External [External Entities] 
         U[User] 
         FB[Facebook Platform] 
         META[Meta Graph API] 
         GFC[Google Fact Check API] 
         ZYLA[Zyla Fact Check API] 
         APIFY[Apify Scraper] 
         GROQ[Groq AI Service] 
     end 
 
     %% Processes 
     subgraph Processes [IncrediNews Processes] 
         P1(1.0 Verify Facebook News) 
         P2(2.0 Poser Detection) 
         P3(3.0 View Trends) 
         P4(4.0 View Reports) 
         P5(5.0 My Verifications) 
         P6(6.0 Poser History) 
     end 
 
     %% Data Stores (COMPLETE: DS1-DS12) 
     subgraph DataStores [Firestore Collections] 
         DS1[(DS1 verification_results)] 
         DS2[(DS2 fb_verification_results)] 
         DS3[(DS3 fb_verification_requests)] 
         DS4[(DS4 pending_verifications)] 
         DS5[(DS5 user_feedback)] 
         DS6[(DS6 login_sessions)] 
         DS7[(DS7 users)] 
         DS8[(DS8 analyzed_pages_cache)] 
         DS9[(DS9 poser_detections)] 
         DS10[(DS10 verified_registry)] 
         DS11[(DS11 account_activity)] 
         DS12[(DS12 votes)] 
     end 
 
     %% Class Assignments 
     class U,FB,META,GFC,ZYLA,APIFY,GROQ external; 
     class P1,P2,P3,P4,P5,P6 process; 
     class DS1,DS2,DS3,DS4,DS5,DS6,DS7,DS8,DS9,DS10,DS11,DS12 store; 
 
     %% Flows for P1: Verify Facebook News 
     U -->|Request Verification| P1 
     DS6 -.->|Check Session| P1 
     DS7 -.->|Check User Status| P1 
     
     P1 -->|Fetch Page HTML| META 
     META -->|Page Content| P1 
     P1 -->|Query Claims| GFC 
     GFC -->|Claim Reviews| P1 
     P1 -->|Supplemental Analysis| ZYLA 
     ZYLA -->|Analysis Data| P1 
     P1 -->|Fallback Scrape| APIFY 
     APIFY -->|Public Signals| P1 
     
     P1 -->|Store Credibility| DS1 
     P1 -->|Store FB Results| DS2 
     P1 -->|Store Requests| DS3 
     P1 -->|Queue Manual Verify| DS4 
 
     %% Flows for P2: Poser Detection 
     U -->|Analyze Page| P2 
     DS6 -.->|Check Session| P2 
     
     P2 -->|Fetch Metadata| META 
     META -->|Page Metadata| P2 
     P2 -->|Fallback Metadata| APIFY 
     APIFY -->|Public Metadata| P2 
     P2 -->|AI Analysis Request| GROQ 
     GROQ -->|Trust Score/JSON| P2 
     
     P2 -->|Cache Metadata| DS8 
     P2 -->|Store Verdict| DS9 
     P2 <-->|Check Registry| DS10 
 
     %% Flows for P3: Trends 
     U -->|View Trends| P3 
     DS2 -->|Read Verified Data| P3 
 
     %% Flows for P4: Reports 
     U -->|View Reports| P4 
     DS2 -->|Read Verified Data| P4 
 
     %% Flows for P5: My Verifications 
     U -->|Manage History/Votes| P5 
     P5 <-->|Read/Update History| DS2 
     P5 -->|Write Votes| DS12 
     P5 -->|Store Feedback| DS5 
 
     %% Flows for P6: Poser History 
     U -->|Manage Detections| P6 
     DS9 -->|Read Detections| P6 
     P6 -->|Delete Entries| DS9 
     P6 -->|Log Delete Action| DS11 
```
