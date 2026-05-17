export interface ProjectEntry {
    id: string;
    title: string;
    date: string;
    bullets: string[];
}

export interface WorkEntry {
    id: string;
    title: string;
    date: string;
    bullets: string[];
}

export type SkillsMap = Record<string, string>;

export const INIT_PROJECTS: ProjectEntry[] = [
    {
        id: "mealmind",
        title: "MealMind (SwiftUI, SwiftData, CoreML, Foundation Models, NaturalLanguage, Speech)",
        date: "Feb 2026",
        bullets: [
            "Built an intelligent iOS meal planning app with voice-powered pantry management, recipe discovery, meal planning, and automated grocery list generation",
            "Integrated on-device Generative AI using Apple's Foundation Models to transform raw speech into structured ingredient data, extracting quantities, units, and item names through engineered prompts",
            "Trained and deployed a CoreML text classifier for real-time ingredient categorization, combined with NLP-based parsing using Apple's NaturalLanguage framework",
        ],
    },
    {
        id: "shiftbot",
        title: "Shiftbot (React Native, TypeScript, Expo)",
        date: "Sep 2025",
        bullets: [
            "Built a React Native mobile app to monitor and automatically claim open shifts for an on-campus job",
            "Implemented secure credential storage and real-time activity logs, improving usability and reducing manual effort",
        ],
    },
    {
        id: "credify",
        title: "Credify (Java, Spring Boot, Hibernate, JPA, Thymeleaf, MySQL)",
        date: "Dec 2024",
        bullets: [
            "Built a web platform using Spring Boot and Hibernate to verify students' academic and work experience data, enabling trusted interactions between students, universities, and employers",
            "Developed RESTful APIs, web controllers, and role-based access control for 8 user roles to support profile management, verification workflows, and application processing",
        ],
    },
    {
        id: "healthcare",
        title: "Healthcare Data Indexing Service (Node.js, Elasticsearch, Redis, RabbitMQ, OAuth 2.0, JWT, Docker)",
        date: "Aug 2025",
        bullets: [
            "Built a RESTful CRUD API in Node.js for a healthcare data management use case, implementing input validation, OAuth 2.0 with JWT-based authentication, and RabbitMQ integration for asynchronous downstream processing",
            "Architected a hierarchical data model that serialized nested JSON into Elasticsearch for full-text search and indexed associated records in Redis as cached key-value pairs with cascading delete support",
            "Containerized the multi-service stack (API server, Elasticsearch, Redis, RabbitMQ) using Docker Compose for consistent local development and deployment",
            "Monitored and visualized indexed data and query performance using Kibana dashboards",
        ],
    },
    {
        id: "shoestride",
        title: "ShoeStrideAR (Xcode, Swift, UIKit, Core Data, Core Animation, Stripe API, Snap CameraKit, Firebase)",
        date: "Apr 2024",
        bullets: [
            "Implemented Augmented Reality Shoe Visualization leveraging Snap CameraKit SDK, enabling real-time overlay of virtual shoe models onto users' feet, ensuring a lifelike user experience",
            "Integrated Stripe payment gateway for secure transactions within the app, ensuring a convenient checkout process",
        ],
    },
    {
        id: "checkmate",
        title: "Checkmate Challenge (Android Studio, Java, SQLite)",
        date: "Mar 2024",
        bullets: [
            "Implemented minimax algorithm for opponent move generation and developed checkmate/stalemate detection logic using graph-based chessboard representation",
            "Built the complete game UI including interactive chessboard rendering, move validation, undo functionality using a stack, and level progression with SQLite-backed player progress tracking",
        ],
    },
    {
        id: "codeab",
        title: "CodeAb (React, Node.js, MongoDB, Firebase, Vercel)",
        date: "Dec 2023",
        bullets: [
            "Built and designed an interactive online coding platform for collaborative problem-solving",
            "Leveraged React for front-end development and utilized Node.js and MongoDB for backend services, showcasing full-stack development capabilities",
        ],
    },
    {
        id: "mindmeld",
        title: "Mind Meld - A Brain-Computer Interface (IoT, EEG, Embedded Systems)",
        date: "May 2019",
        bullets: [
            "Developed an ESP32-based brain-computer interface integrating real-time EEG signal processing with an Android app to control vehicle functions, resulting in a granted patent for the system and method (Patent No: 540976)",
        ],
    },
    {
        id: "airbnb",
        title: "Airbnb Redesign (UI/UX, Figma, Motion Design)",
        date: "Dec 2025",
        bullets: [
            "Designed a trust-first, AI-enhanced Airbnb experience applying industry-standard core UI/UX principles through high-fidelity prototypes using Figma across onboarding, search, booking, group planning, support, and profile flows",
            "Implemented advanced motion design, parallax effects, and a cohesive design system to improve usability, trust perception, and overall user experience",
        ],
    },
];

export const INIT_SKILLS: SkillsMap = {
    "Programming Languages": "Java, JavaScript(ES6), TypeScript, Python, SQL, Swift",
    "Frontend Technologies": "HTML, CSS, SASS/SCSS, jQuery, React.js, Next.js, Material UI",
    "Backend & API": "Node.js, Express.js, Spring Boot, GraphQL, JDBC, REST APIs, OAuth 2.0",
    "Mobile Development": "SwiftUI, UIKit, Android, React Native",
    "Databases & Messaging": "MySQL, Microsoft SQL Server, Firebase, MongoDB, Supabase, Redis, RabbitMQ, Elasticsearch",
    "Testing & Automation": "Selenium, TestNG, Appium, Pytest",
    "IDE": "Xcode, Eclipse, Android Studio, VSCode, PyCharm, IntelliJ",
    "DevOps & Tools": "Docker, GCP, JIRA, Git, GitHub, Postman, Maven, Figma",
};

export const INIT_WORK: WorkEntry[] = [
    {
        id: "pocketcloset",
        title: "Mobile Developer Intern, PocketCloset, Cambridge, MA",
        date: "Jan 2025 – May 2025",
        bullets: [
            "Developed an iOS application using SwiftUI, enabling users to manage their digital wardrobe, organize outfits, and personalize their closet experience",
            "Built a personalized AI stylist chatbot by integrating OpenAI APIs that powered GPT-based Large Language Models (LLMs) and enabled outfit recommendations, natural language style advice and image-based suggestions",
            "Engineered a modular, scalable architecture with MVVM design pattern, separating business logic, UI, and data services",
            "Implemented a custom in-memory cache with Swift concurrency, improving image load times by 98.8% (327ms → 4ms) and cutting network usage from 186 MB to 9.3 MB with only 5 MB overhead",
        ],
    },
    {
        id: "cognizant",
        title: "Associate Programmer Analyst, Cognizant Technology Solutions, India",
        date: "Jun 2019 – Jul 2023",
        bullets: [
            "Developed scripts in Java for automating various scenarios on cloud-based Android application using the Appium framework, significantly enhancing efficiency in the work process",
            "Engineered an Android application for updating daily status reports to reduce time in scrum meetings by 80% demonstrating responsibility and passion for improving team operations",
            "Developed a React-based test execution app integrated with Pytest and Selenium, enabling scripted auto-execution of test flows & reducing manual intervention by 90%; secured 1st place in hackathon for innovation, coding, and design excellence.",
            "Actively participated in hiring by interviewing candidates for automation roles, demonstrating communication skills, integrity and contributing to the culture and team growth",
        ],
    },
];