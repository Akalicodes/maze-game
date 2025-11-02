# 🚀 Deployment Guide - 3D Multiplayer Maze Game

## Quick Overview
Your game is now configured to work both locally and on cloud platforms. This guide will help you deploy it to **Render** (free hosting) and get a public URL.

---

## Step 1: Push to GitHub

### 1.1 Create .gitignore (if you don't have one)

Create a `.gitignore` file in your project root:

```
node_modules/
.DS_Store
*.log
.env
```

### 1.2 Initialize Git and Push

Open PowerShell in your project directory and run:

```powershell
# Initialize git repository
git init

# Add all files
git add .

# Make your first commit
git commit -m "Initial commit - 3D Multiplayer Maze Game"
```

### 1.3 Create GitHub Repository

1. Go to [github.com](https://github.com)
2. Click the **"+"** icon → **"New repository"**
3. Name it: `maze-game-multiplayer` (or any name you like)
4. **DON'T** check "Initialize with README" (you already have files)
5. Click **"Create repository"**

### 1.4 Connect and Push

GitHub will show you commands. Run these in PowerShell:

```powershell
# Add your GitHub repository as remote
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Rename branch to main
git branch -M main

# Push to GitHub
git push -u origin main
```

**Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your actual GitHub username and repository name!**

---

## Step 2: Deploy to Render (Free Hosting)

### 2.1 Sign Up for Render

1. Go to [render.com](https://render.com)
2. Click **"Get Started for Free"**
3. Sign up with your **GitHub account** (easiest option)

### 2.2 Create Web Service

1. After signing in, click **"New +"** button in the top right
2. Select **"Web Service"**
3. Click **"Connect a repository"**
4. Find and select your maze game repository
5. Click **"Connect"**

### 2.3 Configure Service

Fill in these settings:

| Setting | Value |
|---------|-------|
| **Name** | `maze-game` (or any name) |
| **Region** | Select closest to you |
| **Branch** | `main` |
| **Root Directory** | Leave empty |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** |

### 2.4 Environment Variables (Optional)

Scroll down to **"Environment Variables"** section:

- Click **"Add Environment Variable"**
- **Key**: `PORT`
- **Value**: `10000` (or leave empty, Render sets this automatically)

### 2.5 Deploy!

1. Click **"Create Web Service"** at the bottom
2. Render will start building and deploying your app
3. Wait 2-5 minutes (watch the logs scroll)
4. Once you see **"Your service is live 🎉"**, you're done!

---

## Step 3: Access Your Game

### Your Public URL

Render will give you a URL like:

```
https://maze-game-XXXXX.onrender.com
```

You'll see this URL at the top of your service dashboard.

### Share with Friends

Just copy this URL and share it with anyone! They can:
- Play singleplayer immediately
- Create multiplayer rooms
- Join rooms with room codes

---

## 🎮 Testing Your Deployment

1. Open your Render URL in a browser
2. Click **"Multiplayer"** → **"Create Room"**
3. Copy the room code
4. Open the same URL in another browser/device
5. Click **"Join Room"** and paste the code
6. Wait for 4 players total and play!

---

## 📝 Important Notes

### Free Tier Limitations
- Render's free tier spins down after 15 minutes of inactivity
- First visit after inactivity takes ~30-60 seconds to wake up
- This is normal for free hosting!

### If You Make Changes

After updating your code locally:

```powershell
# Add changes
git add .

# Commit
git commit -m "Your change description"

# Push to GitHub
git push

# Render automatically redeploys! ✨
```

Render will automatically detect the GitHub push and redeploy.

---

## 🔧 Troubleshooting

### "Application failed to respond"
- Check Render logs (click "Logs" tab)
- Make sure `package.json` has correct dependencies
- Verify `npm start` works locally

### WebSocket Connection Issues
- Ensure you're using `https://` (not `http://`)
- Check browser console for errors
- Render free tier supports WebSockets! ✅

### Game Not Loading
- Clear browser cache
- Check Render logs for errors
- Make sure all files were pushed to GitHub

---

## 🌟 Alternative Hosting Options

### Other Free Platforms

If you want alternatives to Render:

1. **Railway.app** - Similar to Render, easy setup
   - [railway.app](https://railway.app)
   - $5 free credit per month
   - Very fast deployments

2. **Fly.io** - More complex but powerful
   - [fly.io](https://fly.io)
   - Free tier available
   - Global edge deployment

3. **Heroku** - Classic option (requires credit card)
   - [heroku.com](https://heroku.com)
   - Free hobby dyno available
   - Easy setup with Heroku CLI

### GitHub Pages (Static Only)

⚠️ **Not recommended for this project** because GitHub Pages doesn't support WebSocket servers. You'd need to:
- Host frontend on GitHub Pages
- Host backend separately (Render, Railway, etc.)
- Configure CORS and WebSocket connections

---

## 🎉 Success!

Your game is now live on the internet! 🌐

**Your public URL:** `https://your-app-name.onrender.com`

Share it with friends and enjoy your multiplayer maze game!

---

## 📞 Need Help?

- Check Render logs for error messages
- Verify all files are on GitHub
- Test locally first: `npm start` → visit `http://localhost:8000`
- Make sure port 8000 isn't blocked by firewall

---

**Enjoy your deployed game!** 🎮✨

