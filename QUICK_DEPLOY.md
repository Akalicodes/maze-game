# ⚡ Quick Deploy Commands

Copy and paste these commands in PowerShell (in your project directory):

---

## Step 1: Push to GitHub

```powershell
# Create .gitignore file
@"
node_modules/
.DS_Store
*.log
.env
"@ | Out-File -FilePath .gitignore -Encoding utf8

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - 3D Multiplayer Maze Game"
```

**Now create a repository on GitHub:**
1. Go to https://github.com/new
2. Name it (e.g., `maze-game`)
3. Click "Create repository"

**Then run these (replace YOUR_USERNAME and YOUR_REPO):**

```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

---

## Step 2: Deploy on Render

1. Go to https://render.com
2. Sign up with GitHub
3. Click **"New +"** → **"Web Service"**
4. Select your repository
5. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
6. Click **"Create Web Service"**
7. Wait ~3 minutes

---

## Step 3: Get Your Link

Your game will be live at:

```
https://your-app-name.onrender.com
```

Copy and share this link with anyone! 🎮

---

## Update Your Game Later

```powershell
git add .
git commit -m "Updated game"
git push
```

Render automatically redeploys! ✨

---

**Full guide:** See `DEPLOYMENT_GUIDE.md` for detailed instructions.

