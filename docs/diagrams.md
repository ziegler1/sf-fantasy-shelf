# Zig's Codex — App Flow & Feature Diagrams

---

## 1. Feature Map (App Overview)

```mermaid
mindmap
  root((Zig's Codex))
    Library
      Book Grid / List View
      Filter by Status
      Search by Title / Author
      Group by Author or Genre
      Export CSV
    Book Detail
      Reading Status
      Rating & Review
      Notes
      AI Summary
      Authors & Series
      Tags / Genres
    Series Tracker
      Progress Bars
      Add Missing Books
      AI Series Detection
    Discover
      Next Recommendations
      Similar Authors
      Top Picks by Genre
    Upcoming Releases
      Track Unreleased Books
      Cover Upload
      Convert to Library Entry
    News Feed
      13 RSS Sources
      Source Toggles
      Dismiss Articles
    Analytics
      Books by Status
      Genre Breakdown
      Books by Year
      Publication Decade
      Longest Book
    Account
      Profile Management
      Change Password
      Preferences
    Auth
      Register with Invite Code
      Admin Approval Flow
      Login / JWT
      Forgot Password
      Reset Password
```

---

## 2. Authentication Flow

```mermaid
flowchart TD
    A([User visits app]) --> B{Has JWT token?}
    B -- Yes --> C{Token valid?}
    C -- Yes --> D([Enter app])
    C -- No --> E([/login page])
    B -- No --> E

    E --> F{New user?}
    F -- No --> G[Enter email + password]
    F -- Yes --> H[/register page]

    H --> I[Enter name, email, password\n+ invite code]
    I --> J{First user\never?}
    J -- Yes --> K[Auto-activated]
    J -- No --> L[Status: pending]
    L --> M[Admin receives\napproval email]
    M --> N[Admin clicks\napproval link]
    N --> O[Account activated]
    K --> P[JWT issued]
    O --> P

    G --> Q{Credentials valid?}
    Q -- Yes --> P
    Q -- No --> R[Error: invalid credentials]
    R --> G

    P --> D

    E --> S[Forgot password?]
    S --> T[Enter email]
    T --> U[Reset email sent\ntoken expires in 1hr]
    U --> V[Click link in email]
    V --> W[Enter new password]
    W --> X[Password updated]
    X --> E
```

---

## 3. Core User Flows

```mermaid
flowchart TD
    Start([Logged in]) --> Nav[Navigation]

    Nav --> Lib[Library]
    Nav --> Disc[Discover]
    Nav --> Ser[Series Tracker]
    Nav --> Up[Upcoming Releases]
    Nav --> News[News Feed]
    Nav --> Ana[Analytics]
    Nav --> Dash[Dashboard]

    %% Add Book Flow
    Lib --> AddBtn[+ Add Book]
    AddBtn --> Search[Search Google Books\nor OpenLibrary]
    Search --> Result{Result found?}
    Result -- Yes --> Fill[Pre-fill book details]
    Result -- No --> Manual[Enter details manually]
    Fill --> SetStatus[Set reading status\nwant-to-read / reading / read / dnf]
    Manual --> SetStatus
    SetStatus --> Save[Save to library]
    Save --> BookDetail[Book Detail Dialog]

    %% Book Detail Flow
    BookDetail --> BD1[Update status]
    BookDetail --> BD2[Add rating 1–5 stars]
    BookDetail --> BD3[Write review / notes]
    BookDetail --> BD4[Request AI summary]
    BookDetail --> BD5[Edit authors / tags / series]
    BookDetail --> BD6[Set as featured]
    BookDetail --> BD7[Remove from shelf]

    %% Series Flow
    Ser --> SList[View series list\nwith progress bars]
    SList --> SDetail[Open series]
    SDetail --> SAdd[Add missing book to library]
    SDetail --> SAI[AI: Populate series info]

    %% Upcoming Flow
    Up --> UAdd[Add upcoming book]
    UAdd --> UCover[Upload cover to R2]
    UCover --> USave[Save release]
    USave --> UConvert{Book released?}
    UConvert -- Yes --> MoveToLib[Convert to library entry]

    %% News Flow
    News --> NFilter[Toggle news sources]
    News --> NRead[Read article]
    News --> NDismiss[Dismiss article]

    %% Analytics Flow
    Ana --> AStats[View stats:\ntotal books, avg rating,\nbooks this year]
    Ana --> AGenre[Genre breakdown chart]
    Ana --> AYear[Books finished by year]
    Ana --> ADecade[Publication decade trend]
    Ana --> AExport[Export library CSV]
```

---

## 4. AI Features Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Claude as Claude API

    %% AI Summary
    User->>Frontend: Open Book Detail
    User->>Frontend: Click "Generate AI Summary"
    Frontend->>Backend: POST /claude/summary
    Note over Backend: Check rate limit (20/hr)
    Backend->>Claude: Send book title + description
    Claude-->>Backend: Return structured summary
    Backend-->>Frontend: Summary text (cached)
    Frontend-->>User: Display summary

    %% Next Recommendations
    User->>Frontend: Open Discover page
    User->>Frontend: Click "Get Recommendations"
    Frontend->>Backend: POST /claude/next
    Note over Backend: Check rate limit (20/hr)
    Backend->>Backend: Load user's full library
    Backend->>Claude: Send library + prompt for next books
    Claude-->>Backend: List of recommended books
    Backend-->>Frontend: Recommendations
    Frontend-->>User: Display book cards

    %% Similar Authors
    User->>Frontend: Select an author
    User->>Frontend: Click "Find Similar Authors"
    Frontend->>Backend: POST /claude/similar-authors
    Note over Backend: Check rate limit (20/hr)
    Backend->>Claude: Send author name + genre context
    Claude-->>Backend: List of similar authors
    Backend-->>Frontend: Author suggestions
    Frontend-->>User: Display author list

    %% Series Detection
    User->>Frontend: Add new book
    Frontend->>Backend: POST /claude/series-detect
    Note over Backend: Check rate limit (100/hr)
    Backend->>Claude: Send book title + author
    Claude-->>Backend: Series name + position
    Backend-->>Frontend: Auto-fill series info
    Frontend-->>User: Pre-populated series field
```

---

## 5. Data Model (Entity Relationships)

```mermaid
erDiagram
    USER {
        int id PK
        string email
        string name
        string password_hash
        string status
        timestamp created_at
    }

    BOOK {
        int id PK
        string title
        string isbn
        text description
        string cover_url
        date published_at
        int page_count
        string language
        text ai_summary
    }

    AUTHOR {
        int id PK
        string name
        text bio
        string website
        string image_url
    }

    SERIES {
        int id PK
        string name
        text description
    }

    TAG {
        int id PK
        string name
    }

    USER_BOOK {
        int id PK
        int user_id FK
        int book_id FK
        string status
        int rating
        text review
        text notes
        timestamp started_at
        timestamp finished_at
        boolean featured
    }

    BOOK_AUTHOR {
        int book_id FK
        int author_id FK
        string role
    }

    BOOK_SERIES {
        int book_id FK
        int series_id FK
        float position
    }

    BOOK_TAG {
        int book_id FK
        int tag_id FK
    }

    AUTHOR_FOLLOW {
        int id PK
        int user_id FK
        int author_id FK
    }

    UPCOMING_RELEASE {
        int id PK
        int user_id FK
        string title
        string author_name
        date release_date
        string isbn
        string cover_url
        text description
        text notes
    }

    NEWS_ARTICLE {
        int id PK
        string source_name
        string title
        string url
        text description
        string image_url
        timestamp published_at
    }

    USER_FEED_SOURCE {
        int user_id FK
        string source_name
        boolean enabled
    }

    PASSWORD_RESET_TOKEN {
        int id PK
        int user_id FK
        string token
        timestamp expires_at
        boolean used
    }

    USER ||--o{ USER_BOOK : "shelves"
    BOOK ||--o{ USER_BOOK : "on shelf of"
    USER ||--o{ AUTHOR_FOLLOW : "follows"
    AUTHOR ||--o{ AUTHOR_FOLLOW : "followed by"
    BOOK ||--o{ BOOK_AUTHOR : "written by"
    AUTHOR ||--o{ BOOK_AUTHOR : "authored"
    BOOK ||--o{ BOOK_SERIES : "part of"
    SERIES ||--o{ BOOK_SERIES : "contains"
    BOOK ||--o{ BOOK_TAG : "tagged with"
    TAG ||--o{ BOOK_TAG : "applied to"
    USER ||--o{ UPCOMING_RELEASE : "tracks"
    USER ||--o{ USER_FEED_SOURCE : "configures"
    USER ||--o{ PASSWORD_RESET_TOKEN : "has"
```

---

## 6. Navigation & Routing Map

```mermaid
flowchart LR
    Root["/"] --> Login["/login"]
    Root --> Register["/register"]
    Root --> ForgotPw["/forgot-password"]
    Root --> ResetPw["/reset-password"]

    Login --> Auth{Authenticated?}
    Auth -- Yes --> Layout[Layout\nwith nav sidebar]
    Auth -- No --> Login

    Layout --> Dashboard["/dashboard\nStats + now reading\n+ upcoming + top picks"]
    Layout --> Library["/library\nGrid / List / Author\n/ Genre view"]
    Layout --> Series["/series\nSeries progress tracker"]
    Layout --> Discover["/discover\nAI recommendations\n+ similar authors"]
    Layout --> Upcoming["/upcoming\nUnreleased book tracker"]
    Layout --> News["/news\nRSS news feed"]
    Layout --> Analytics["/analytics\nReading statistics"]
    Layout --> Account["/account\nProfile + preferences"]

    Library --> BookDialog["[Dialog]\nBook Detail\nView / Edit / Rate / Summarize"]
    Library --> AddDialog["[Dialog]\nAdd Book\nSearch + Import"]
    BookDialog --> AddDialog
```

---

## 7. Backend API Map

```mermaid
graph LR
    FE[Frontend\nAngular] --> API[Express API\n/api]

    API --> Auth["/auth\nregister\nlogin\napprove\nme\nprofile\nchange-password\nforgot-password\nreset-password"]

    API --> Books["/books\nGET list\nGET :id\nPOST create\nPUT update\nDELETE\nshelf CRUD\nauthors / tags\nfeature\nretry-cover\nexport CSV"]

    API --> Authors["/authors\nCRUD\nfollow / unfollow\nrestore"]

    API --> SeriesAPI["/series\nCRUD"]

    API --> ClaudeAPI["/claude\nsummary\nnext\nsimilar-authors\nseries-detect"]

    API --> NewsAPI["/news\nlist articles\ndismiss\nsources CRUD"]

    API --> SearchAPI["/search\nGoogle Books\nOpenLibrary fallback"]

    API --> UpcomingAPI["/upcoming\nCRUD"]

    API --> Uploads["/uploads\nR2 cover upload"]

    ClaudeAPI --> AnthropicSDK[Anthropic SDK\nClaude Sonnet 4.5]
    Books --> DB[(PostgreSQL)]
    Auth --> DB
    Authors --> DB
    SeriesAPI --> DB
    NewsAPI --> DB
    UpcomingAPI --> DB
    Uploads --> R2[Cloudflare R2\nObject Storage]
    Auth --> Email[Resend\nEmail Service]
    NewsAPI --> RSS[13 RSS Feeds\ncron every 4hrs]
```
