# DataPilot - Advanced Salesforce Data Platform

<div align="center">
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="80" height="80">
    <polygon
      points="4.69 7.7 9.38 4.99 9.38 2.27 2.25 6.38 2.64 6.86 4.26 7.74 4.69 7.7"
      fill="#4285f4"
    />
    <path
      d="M9.38,17.36,2.25,13.25V10.66l7.13,4.12Zm0,1.77L2.25,15v2.6l7.13,4.12Zm0-8.71L4.69,7.7,2.25,6.38v2.5L9.38,13"
      fill="#aecbfa"
      fillRule="evenodd"
    />
    <path
      d="M9.38,21.73l7-4V15.1l-7,4m0-4.35,7-4h2.08v2.33H16.78l-7.4,4.29Zm0-1.77L16.79,8.7h2.44v1.36l2.51-2.51-2.51-2.5V6.37H16.36l-1.23.72-1.06.61L11.35,9.27l-2,1.15Z"
      fill="#669df6"
      fillRule="evenodd"
    />
    <polygon
      points="9.38 4.99 12.54 6.82 14.9 5.46 9.38 2.27 9.38 4.99"
      fill="#669df6"
      fillRule="evenodd"
    />
  </svg>
  
  <br><br>
  
<img src="https://img.shields.io/badge/🤖-AI%20POWERED%20QUERIES-FF6B6B?style=for-the-badge&logo=robot&logoColor=white" alt="AI Powered Queries"> <img src="https://img.shields.io/badge/⚡-REAL--TIME%20STREAMING-00D4AA?style=for-the-badge&logo=lightning&logoColor=white" alt="Real-time Streaming"> <img src="https://img.shields.io/badge/📊-VISUAL%20SCHEMA-4ECDC4?style=for-the-badge&logo=chart&logoColor=white" alt="Visual Schema">

</div>

---

## **ADVANCED SALESFORCE DATA PLATFORM**

**Transform Salesforce data interaction with AI-infused intelligent query assistance, visual schema exploration, and advanced SOQL development.**

![DataPilot AI Platform Features](imgs/general/combined-features-horizontal.png)

**[Click here to view full-resolution features showcase](imgs/general/combined-features-optimized.png)**

*Experience the complete DataPilot AI platform in action*

---

## **CORE FEATURES**

> **Click on any feature below to explore detailed documentation and capabilities**

---

### **1. [AI-Powered Query Assistant](docs/01-ai-powered-query-assistant.md)**
**INTELLIGENT NATURAL LANGUAGE TO SOQL CONVERSION**

> **DataPilot's flagship AI feature - Advanced natural language processing for Salesforce queries**

![AI-Powered Query Assistant Demo](imgs/ai-assistant/demo.gif)

- **Custom ReAct Agent**: LangGraph-based agent for Salesforce operations
- **Real-time Streaming**: Live responses with intelligent chunked delivery
- **Persistent Conversation Memory**: Conversation state management with MongoDB
- **4 Specialized Salesforce Tools**: Object search, metadata, relationships, and query execution
- **Data Redaction Strategy**: Optimized LLM token usage with complete data security
- **Multi-turn Conversations**: Context-aware follow-up interactions

**Key Capabilities:**
- Converts natural language to complex SOQL queries
- Maintains conversation context across interactions
- Provides intelligent query suggestions
- Streams responses in real-time for better user experience

**Supported Use Cases:**
- **Object Discovery**: "Find all objects related to customer data"
- **Field Exploration**: "What fields are available on the Account object?"
- **Relationship Mapping**: "How are Account and Contact objects related?"
- **Data Queries**: "Show me all opportunities closing this month"
- **Complex Queries**: "Get accounts with their related contacts and opportunities"
- **Field Details**: "What are the picklist values for the Status field on Case?"
- **Multi-turn Conversations**: Build complex queries through iterative refinement

---

### **2. [Interactive Schema Explorer](docs/02-interactive-schema-explorer.md)**
**VISUAL SCHEMA EXPLORATION FOR SALESFORCE METADATA**

![Schema Explorer Demo](imgs/schema-explorer/schema-tree-demo.gif)

- **Hierarchical Tree Navigation**: Expandable tree view of Salesforce objects and fields
- **Visual Canvas Interface**: Interactive drag-and-drop schema visualization
- **Smart Relationship Mapping**: Visual relationship intelligence and navigation
- **Performance-Optimized Caching**: Intelligent caching for instant access
- **Drag-and-Drop Integration**: Seamless integration with query editor

---

### **3. [Advanced SOQL Query Editor](docs/03-advanced-soql-query-editor.md)**
**INTELLIGENT SOQL DEVELOPMENT ENVIRONMENT**

![Advanced SOQL Query Editor Demo](imgs/soql-editor/advanced-soql-query-editor-demo.gif)

- **6-Level Context-Aware Autocomplete**: SObject, field, relationship, keyword, function, nesting
- **Professional Code Formatting**: Advanced query formatting
- **Bidirectional Integration**: Seamless schema canvas integration
- **Multi-Hierarchy Results**: Advanced result visualization with 4-level nesting
- **Real-time Validation**: Instant error detection and correction
---



## **TECHNICAL ARCHITECTURE**

### **AI Engine Architecture**
```mermaid
graph LR
    A[Natural Language Input] --> B[AI Agent Processing]
    B --> C[Salesforce Tools Execution]
    C --> D[Intelligent Data Processing]
    D --> E[Context-Aware Response]
    E --> F[Real-time Streaming Output]
    F --> G[Conversation Learning]
    G --> B
```

### **Frontend Technology**
- **React + TypeScript**: Modern, type-safe development
- **Vite Build System**: Lightning-fast development
- **Mantine UI**: Professional, accessible components
- **Real-time WebSockets**: Live streaming communication

### **Backend Technology**
- **Python + FastAPI**: High-performance API framework
- **LangGraph Integration**: Advanced AI workflow orchestration
- **MongoDB**: Scalable data persistence
- **OpenAI Integration**: Cutting-edge language models

---

## **COMPLETE DOCUMENTATION SUITE**

### **Core Features**
- **[AI-Powered Query Assistant](docs/01-ai-powered-query-assistant.md)** - Natural language to SOQL conversion
- **[Interactive Schema Explorer](docs/02-interactive-schema-explorer.md)** - Visual metadata exploration
- **[Advanced SOQL Query Editor](docs/03-advanced-soql-query-editor.md)** - Intelligent code editor
- **[Apex Code Management](docs/05-apex-code-management.md)** - Apex development tools (Under Development)

---

## **GET STARTED WITH DATAPILOT**

### **Quick Start**
- Clone the repository and follow the setup instructions
- **Backend Setup**: Follow the [Backend README](backend/README.md) for Python/FastAPI setup
- **Frontend Setup**: Follow the [Frontend README](dashboard/README.md) for React/TypeScript setup
- **Docker Deployment**: Use the [Docker README](docker/README.md) for containerized deployment
- Configure your Salesforce connection
- Start using the AI-powered query assistant

### **Advanced Configuration**
- **Integration Setup**: API and external system connections
- **Monitoring**: Usage monitoring

---

## **DEPLOYMENT & DEVELOPMENT DOCUMENTATION**
- **[Docker README](docker/README.md)** - Complete docker deployment guide
- **[Backend README](backend/README.md)** - Complete backend development guide
- **[Frontend README](dashboard/README.md)** - Complete frontend development guide

---

## **LICENSE**

This project is licensed under the DataPilot License - see the [LICENSE](../LICENSE) file for details.

**Commercial and Enterprise Use**: Requires prior written permission. Contact: [https://www.linkedin.com/in/bassem-elsodany/](https://www.linkedin.com/in/bassem-elsodany/)

---

<div align="left">

**ADVANCED SALESFORCE DATA PLATFORM**

*Transform your Salesforce experience with intelligent query assistance, visual schema exploration, and advanced SOQL development.*

</div>