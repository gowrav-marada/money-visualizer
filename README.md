# 💰 Money Visualizer

A modern, interactive, mobile-friendly web application to track and visualize money transactions in Indian Rupees (₹). Track money you give, money you'll get, and get detailed analytics with beautiful charts and summaries.

## ✨ Features

### 📊 Dashboard
- **Summary Cards**: View total to give, total to get, and net balance at a glance
- **Interactive Charts**: 
  - Balance Overview (Doughnut Chart)
  - Monthly Trends (Line Chart)
- **Statistics**: Highest payment, average payment, total people, total transactions

### 💳 Transaction Management
- ✅ **Add Transactions**: Define person name, amount, type (Give/Get), date, and notes
- ✏️ **Edit Transactions**: Modify any transaction details
- 🗑️ **Delete Transactions**: Remove transactions with confirmation
- 📅 **Date Tracking**: Track when each transaction occurred

### 🔍 Advanced Filters & Search
- **Filter by Person**: View transactions for specific people
- **Filter by Type**: Show only "Give" or "Get" transactions
- **Date Range Filter**: Filter by specific time periods
- **Reset Filters**: Quickly clear all filters

### 📈 Analytics
- **Person-wise Analysis**: Bar charts showing money dynamics with each person
- **Detailed Summaries**: For each person, see total given, total to get, balance, and transaction count
- **Balance Indicators**: Know instantly if someone owes you or if you owe them

### 📋 Summary Reports
- **Monthly Breakdown**: Detailed financial summaries organized by month
- **Monthly Metrics**: Total to give, total to get, net balance, and transaction count per month

### 📥 Data Export
- **CSV Export**: Download all transactions in CSV format for spreadsheet analysis
- **Date-stamped Files**: Exports automatically include the export date

### 💾 Data Persistence
- **Browser Storage**: All data is stored locally using browser localStorage
- **No Sign-up Required**: All data stays on your device
- **Persistent Access**: Your data persists even after closing the browser

### 📱 Mobile Friendly
- **Fully Responsive**: Works perfectly on phones, tablets, and desktops
- **Touch Optimized**: Large buttons and easy-to-use interface for mobile
- **No Horizontal Scroll**: Content adapts to all screen sizes

## 🚀 Quick Start

### Option 1: Direct Access (No Installation)
Simply open `index.html` in any modern web browser:
- Chrome, Firefox, Safari, Edge all supported
- Works offline after first load

### Option 2: GitHub Pages Deployment

#### Step 1: Create GitHub Repository
1. Go to [GitHub.com](https://github.com)
2. Sign in or create an account
3. Create a new repository (any name, e.g., `money-visualizer`)
4. Choose "Public" to make it accessible from anywhere

#### Step 2: Push Code to GitHub
```bash
# Navigate to your project directory
cd "C:\Users\232001\OneDrive - American Airlines, Inc\Desktop\Project\"

# Initialize git repo (if not already done)
git init

# Add all files
git add .

# Commit changes
git commit -m "Initial commit: Money Visualizer with enhanced features"

# Add remote repository (replace USERNAME and REPO with your details)
git remote add origin https://github.com/USERNAME/REPO.git

# Push to GitHub
git branch -M main
git push -u origin main
```

#### Step 3: Enable GitHub Pages
1. Go to your repository on GitHub
2. Click **Settings** (top menu)
3. Scroll to **Pages** section
4. Under "Source", select **main** branch
5. Click **Save**
6. Your site will be published at: `https://USERNAME.github.io/REPO/`

#### Step 4: Access Anywhere
Open `https://USERNAME.github.io/REPO/` from any device, anywhere in the world!

## 📖 Usage Guide

### Adding a Transaction
1. Go to **Dashboard** tab
2. Scroll to "Add New Transaction" section
3. Fill in:
   - **Person's Name**: Who the transaction is with
   - **Amount**: Transaction amount in Rupees
   - **Type**: Select "I need to give" or "I will get"
   - **Date**: When the transaction occurred (auto-fills today)
   - **Description**: Optional notes
4. Click **Add Transaction** button

### Viewing Transactions
- Go to **Transactions** tab
- See all transactions in a list
- Use filters to find specific transactions
- Latest transactions appear first

### Viewing Analytics
- Go to **Analytics** tab
- See person-wise bar chart comparison
- View detailed summary for each person
- Instantly see who owes you money

### Getting Summary Reports
- Go to **Summary** tab
- View monthly financial breakdowns
- See trends across months
- Track give vs get patterns

### Exporting Data
- Go to **Transactions** tab
- Click **Export CSV** button
- Save file to your computer
- Open in Excel or Google Sheets for further analysis

## 🎯 Currency & Localization

Currently configured for **Indian Rupees (₹)**. All amounts display with ₹ symbol and are in INR.

To change currency:
1. Open `index.html` in a text editor
2. Find and replace: `₹` with your currency symbol (e.g., `$`, `€`, `£`)
3. Save and reload

## 🔒 Privacy & Security

- ✅ **No Server Storage**: All data stays on your device
- ✅ **No Sign-up Required**: No personal information collected
- ✅ **No Tracking**: No analytics or cookies
- ✅ **Offline Ready**: Works completely offline
- ✅ **Local Control**: You control your data

## ⚙️ Technical Details

- **Frontend Technology**: HTML5, CSS3, JavaScript (Vanilla)
- **Data Storage**: Browser localStorage (5-10MB capacity)
- **Charts**: Chart.js library
- **Icons**: Font Awesome
- **Mobile Framework**: CSS Grid & Flexbox
- **No Dependencies** to install: Just open the HTML file!

## 🐛 Browser Compatibility

- Chrome/Chromium 60+
- Firefox 60+
- Safari 12+
- Edge 79+
- Mobile browsers (iOS Safari, Chrome Mobile, Firefox Mobile)

## 📝 Local Storage Data Format

Transactions are stored as JSON:
```json
{
  "id": 1234567890,
  "personName": "John Doe",
  "amount": 500,
  "type": "give",
  "description": "Lunch expense",
  "date": "12/15/2024"
}
```

## 🛣️ Roadmap

Future enhancements:
- [ ] Dark mode theme
- [ ] Multi-currency support
- [ ] Cloud sync option
- [ ] Mobile app native version
- [ ] Recurring transactions
- [ ] Category-wise breakdowns
- [ ] Receipt attachment
- [ ] Friend split management

## ☁️ Supabase Cloud Sync Setup (Use Anywhere)

### 1) Add environment variables
Create `.env` in project root:

- `VITE_SUPABASE_URL=your_supabase_project_url`
- `VITE_SUPABASE_ANON_KEY=your_supabase_anon_key`

### 2) Create table in Supabase SQL Editor
```sql
create table if not exists public.money_user_data (
  user_id uuid primary key,
  transactions jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```

### 3) Enable Google provider
In Supabase dashboard:
- Go to **Authentication > Providers > Google**
- Enable Google provider
- Add OAuth client ID and secret
- Add redirect URL: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

### 4) Row Level Security policy
Enable RLS and allow users to access only their own row:
```sql
alter table public.money_user_data enable row level security;

create policy "Users can read own data"
on public.money_user_data
for select
using (auth.uid() = user_id);

create policy "Users can insert own data"
on public.money_user_data
for insert
with check (auth.uid() = user_id);

create policy "Users can update own data"
on public.money_user_data
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

### 5) Run app
- `npm.cmd install`
- `npm.cmd run dev`

When signed in with Google, the app syncs transactions/settings across devices. On first login, local data is migrated to cloud if no cloud record exists.

## 💡 Tips & Tricks

1. **Data Backup**: Periodically export CSV to back up your data
2. **Multiple Devices**: Sign in with the same Google account for automatic sync
3. **Clear Cache**: If something breaks, try clearing browser cache
4. **Print Reports**: Use browser print function (Ctrl+P) to print summaries
5. **URL Bookmark**: Bookmark the app URL for quick access

## ❓ FAQ

**Q: Will my data be lost if I clear browser cache?**
A: Yes. The Clear All Data button is intentionally hidden to prevent accidents, but clearing browser cache or using private/incognito mode will clear data.

**Q: Can I use this on multiple devices?**
A: Yes. Configure Supabase, sign in with Google, and your data syncs automatically across devices.

**Q: Is internet required?**
A: No. Once loaded, the app works completely offline. Internet is only needed for initial GitHub Pages access and to export data.

**Q: How much data can I store?**
A: Browser localStorage typically allows 5-10MB. That's roughly 50,000+ transactions.

**Q: Can I share my data?**
A: Export as CSV and share the file. The app doesn't have built-in sharing yet.

## 📞 Support

For issues or suggestions, feel free to create an issue in the GitHub repository or contact the developer.

## 📄 License

MIT License - Feel free to use, modify, and distribute!

---

**Made with ❤️ for better money management**

Last Updated: December 2024
