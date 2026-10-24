# Money Visualizer

A colorful, responsive personal finance tracker with five tabs:

| Tab | Purpose |
|---|---|
| **Dashboard** | Net position, balance, income/expenses, receivables, bills, charts and alerts |
| **Credits & Debits** | Money between you and other people, partial settlements, history, reminders |
| **Expenses** | Personal income and spending, filters, trends, recurring entries, receipts, CSV export |
| **Bills** | Card statements, utilities, subscriptions; payments; optional read-only email import |
| **Settings** | Currency/format/theme, reminders, categories, accounts, PIN lock, backup, delete data |

## Stack

- **Frontend:** Angular 20 (standalone components, signals), custom SVG charts, light/dark themes
- **Backend:** ASP.NET Core (.NET 10) Web API, EF Core
- **Database:** SQLite (a single file: `backend/App_Data/moneyvis.db`, created automatically)
- **Login:** Google sign-in (OpenID Connect)

## Financial formulas

- Current balance = total income − personal expenses
- Net receivables = remaining to receive − remaining to pay
- Net financial position = current balance + net receivables − unpaid bills

Personal transactions, money owed between people, and bills are stored separately. Credit-card bill payments count as transfers, not new expenses, so card purchases are counted only once.

## Setup

### 1. Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/)
- Optional: `dotnet tool install --global dotnet-ef` (for creating new migrations)

### 2. Create Google login credentials

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.
2. Go to **APIs & Services → OAuth consent screen**, choose **External**, fill in the app name and your email, and add yourself as a **test user**.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**, then choose **Web application**.
4. Add **Authorized JavaScript origin**: `http://localhost:4200`
5. Add **Authorized redirect URI**: `http://localhost:4200/signin-google`
6. Copy the client ID and client secret.

### 3. Store the secrets (never in appsettings.json)

From the repository root:

```powershell
dotnet user-secrets --project .\backend init
dotnet user-secrets --project .\backend set "Authentication:Google:ClientId" "your-client-id.apps.googleusercontent.com"
dotnet user-secrets --project .\backend set "Authentication:Google:ClientSecret" "your-client-secret"
```

> If you leave the Google client ID empty, development mode uses a local sample user so you can try the app without signing in.

### 4. Run the backend

```powershell
dotnet run --project .\backend
```

The API runs at `http://localhost:5289`. On first start it creates the SQLite database, applies migrations and, in development, adds sample data.

### 5. Run the frontend (second terminal)

```powershell
cd .\frontend
npm install
npm start
```

Open **http://localhost:4200** and sign in with Google. The Angular dev server proxies `/api` and `/signin-google` to the backend, so cookies work on one origin.

> If PowerShell blocks `npm`, use `npm.cmd install` and `npm.cmd start`.

### 6. Optional: detect bills from email

Bill detection is read-only and always asks you to review before saving. It cannot read emails that have been permanently deleted.

**Gmail:** in the same Google Cloud project, enable the **Gmail API**, add the scope `gmail.readonly` to the consent screen, and add redirect URI `http://localhost:4200/api/email/callback/Gmail`. Then run:

```powershell
dotnet user-secrets --project .\backend set "Email:Gmail:ClientId" "your-client-id"
dotnet user-secrets --project .\backend set "Email:Gmail:ClientSecret" "your-client-secret"
```

**Outlook:** in [Microsoft Entra app registrations](https://entra.microsoft.com/), register an app for personal and work accounts. Add the **Web** redirect URI `http://localhost:4200/api/email/callback/Outlook` and the delegated Graph permission `Mail.Read`. Create a client secret, then run:

```powershell
dotnet user-secrets --project .\backend set "Email:Outlook:ClientId" "your-app-id"
dotnet user-secrets --project .\backend set "Email:Outlook:ClientSecret" "your-secret"
```

Then open **Bills → From email → Connect**, and choose **Sync now**.

## Useful commands

```powershell
dotnet build .\backend                                   # build the API
cd .\frontend; npx ng build                              # production frontend build
cd .\backend; dotnet ef migrations add <Name> -o Data/Migrations   # after model changes
```

To reset all data, stop the backend and delete `backend\App_Data\moneyvis.db`.

## Security notes

- Every record is scoped to the signed-in user.
- API requests require the `X-Requested-With` header (CSRF protection), which the Angular app adds automatically.
- Mailbox tokens are encrypted with ASP.NET Data Protection and are never included in backups.
- For production, set secrets through environment variables (for example, `Authentication__Google__ClientId`), use HTTPS, and update the redirect URIs to your domain.
