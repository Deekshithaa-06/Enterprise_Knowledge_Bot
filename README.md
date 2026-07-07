# Enterprise Knowledge Bot

## Overview

Enterprise Knowledge Bot is an AI-powered knowledge management platform designed to enable users to upload, manage, search, and interact with enterprise documents through Retrieval-Augmented Generation (RAG) and Generative AI.

The application supports document ingestion, intelligent search, contextual question answering, user authentication, document management, chat history tracking, and administrative controls through a modern web-based interface.

---

## Features

### Document Intelligence
- Retrieval-Augmented Generation (RAG)
- AI-powered document question answering
- Semantic document search
- Context-aware responses

### User Management
- User registration and authentication
- Secure password management
- Role-based access control
- User-specific document access

### Administrative Features
- Admin dashboard
- User management
- Document monitoring and management

### Document Support
- PDF (.pdf)
- Microsoft Word (.docx)
- Microsoft PowerPoint (.pptx)
- Microsoft Excel (.xlsx)

---

## Technology Stack

### Frontend
- React.js
- Vite
- React Router DOM
- Recharts
- Lucide React

### Backend
- FastAPI
- Uvicorn
- SQLite
- JWT Authentication
- Passlib

### AI & Document Processing
- Gemini AI
- PyMuPDF
- Python-Docx
- Python-PPTX
- Pandas
- OpenPyXL

---

## Repository Setup

### Clone Repository

```bash
git clone https://github.com/Deekshithaa-06/Enterprise_Knowledge_Bot.git

cd Enterprise_Knowledge_Bot

git checkout deekshitha-prototype2
```

---

## Backend Setup

Install the required dependencies:

```bash
pip install -r backend\requirements.txt
```

---

## Frontend Setup

Navigate to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

If required:

```bash
npm install react-router-dom lucide-react recharts
```

---

## Environment Configuration

Create a `.env` file inside the backend directory.

```env
GEMINI_API_KEY=your_api_key_here
```

Example:

```env
GEMINI_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxx
```

---

## Running the Application

### Start Backend

From the project root directory:

```bash
uvicorn backend.main:app --reload
```

Backend URL:

```text
http://127.0.0.1:8000
```

---

### Start Frontend

In a separate terminal:

```bash
cd frontend

npm run dev
```

Frontend URL:

```text
http://127.0.0.1:5173
```

---

## Project Structure

```text
Enterprise_Knowledge_Bot
│
├── backend
│   ├── main.py
│   ├── auth.py
│   ├── database.py
│   ├── requirements.txt
│   └── .env
│
├── frontend
│   ├── src
│   ├── public
│   ├── package.json
│   └── vite.config.js
│
├── .gitignore
└── README.md
```

---

## Authentication Workflow

1. Register a user account.
2. Authenticate using registered credentials.
3. Upload and manage documents.
4. Interact with uploaded content using natural language queries.
5. Review chat history and previous interactions.

---

## Important Notes

- Do not commit `.env` files.
- Do not commit SQLite database files (`knowledge_bot.db`).
- Ensure a valid Gemini API key is configured before application startup.
- Install all dependencies before running the application.

---

## Development Branch

```text
deekshitha-prototype2
```

---

## Contributors

- Deekshitha Kammela
- Shashank Anand Gedela

---

## Acknowledgement

Developed as part of the Accenture ATCI Internship Program under the Enterprise Platform (Oracle CX) team.
