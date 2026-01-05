# Netflix Replica (Frontend Only)

A frontend-only Netflix clone with a beautiful Netflix-style UI and mock data. No backend or database required!

## Features

- 🎬 **Netflix-style UI** with hero banner and content rows
- 🎥 **Video player** with sample videos
- 🔍 **Search functionality** with mock data
- 📝 **My List** feature (saved in browser)
- 📺 **Continue watching** with progress tracking
- 🎯 **Auto-login** - no authentication needed
- 📱 **Responsive design** that looks great on all devices
- ⚡ **No backend required** - runs entirely in the browser

## Tech Stack

- React 18
- React Router DOM
- React Icons
- Mock data (no API calls)

## Project Structure

```
netflix-replica/
└── frontend/
    ├── public/
    │   └── index.html
    └── src/
        ├── components/
        │   ├── Navbar.js          # Navigation bar
        │   ├── HeroBanner.js      # Featured content banner
        │   ├── Row.js             # Horizontal content rows
        │   └── VideoPlayer.js     # Full-screen video player
        ├── pages/
        │   ├── Home.js            # Main browse page
        │   ├── Login.js           # Login page (auto-bypassed)
        │   ├── Register.js        # Register page (auto-bypassed)
        │   ├── Search.js          # Search page
        │   └── MyList.js          # My list & watch history
        ├── context/
        │   └── AuthContext.js     # Auto-login context
        ├── services/
        │   ├── api.js             # Mock API service
        │   └── mockData.js        # Sample videos & data
        ├── styles/
        │   └── App.css            # Netflix-style CSS
        ├── App.js                 # Main app component
        └── index.js               # Entry point
```

## Quick Start

### 1. Install Dependencies

```bash
cd netflix-replica/frontend
npm install
```

### 2. Start the Application

```bash
npm start
```

The app will automatically open at `http://localhost:3000`

**That's it!** No database setup, no backend configuration, no authentication required.

## What You'll See

The app automatically logs you in as a demo user and displays:

- **Hero Banner** - Featured movie with Play and More Info buttons
- **Trending Now** - Popular content
- **New Releases** - Recently added content
- **Action** - Action genre movies
- **Comedy** - Comedy genre movies
- **Drama** - Drama genre movies

## Features in Detail

### Browse Content
- Navigate to the home page to see featured content
- Scroll through different content rows
- Click any thumbnail to watch a video

### Video Player
- Click any video to open the full-screen player
- Video controls for play/pause, volume, and fullscreen
- Progress is automatically tracked
- Press the X button to close the player

### Search
- Click "Search" in the navigation bar
- Type your search query (try "adventure", "comedy", "space")
- Results appear instantly
- Click any result to watch

### My List
- Click "My List" in the navigation
- See your saved videos
- View "Continue Watching" with your viewing history

## Sample Videos

The app includes 8 sample videos across different genres:

1. **The Adventure Begins** - Action/Adventure (Featured)
2. **Laugh Out Loud** - Comedy
3. **Dark Secrets** - Thriller/Drama
4. **Space Odyssey** - Sci-Fi/Adventure
5. **Love Story** - Romance/Drama
6. **Action Heroes** - Action
7. **Comedy Central** - Comedy
8. **Drama Unleashed** - Drama

All videos use free sample content from Google's test video repository.

## Customization

### Add Your Own Videos

Edit `src/services/mockData.js` to add more videos:

```javascript
{
  _id: '9',
  title: 'Your Video Title',
  description: 'Video description here',
  videoUrl: 'https://your-video-url.mp4',
  thumbnailUrl: 'https://your-thumbnail.jpg',
  bannerUrl: 'https://your-banner.jpg',
  duration: 120,
  year: 2024,
  rating: 'PG-13',
  genres: ['Action', 'Adventure'],
  cast: ['Actor 1', 'Actor 2'],
  director: 'Director Name',
  isTrending: true,
  isFeatured: false,
  isNewRelease: true
}
```

### Modify Styling

Edit `src/styles/App.css` to customize the look and feel.

### Change Mock User

Edit `src/services/mockData.js` to change the demo user:

```javascript
export const mockUser = {
  id: 'your-user-id',
  email: 'your@email.com',
  name: 'Your Name',
  profiles: [
    {
      name: 'Your Profile',
      avatar: 'https://your-avatar.png',
      isKids: false
    }
  ]
};
```

## How It Works

This is a **frontend-only** application that simulates a Netflix-like experience:

1. **No Backend** - All data is stored in JavaScript files
2. **Mock API** - The `api.js` file returns mock data instead of making HTTP requests
3. **Auto-Login** - Users are automatically logged in as a demo user
4. **Browser Storage** - "My List" and watch history are stored in memory (resets on refresh)
5. **Sample Videos** - Uses free test videos from Google Cloud Storage

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Performance

The app is extremely fast because:
- No network requests (except loading videos)
- No database queries
- All data is in-memory
- Optimized React components

## Deployment

### Deploy to Netlify

1. Push your code to GitHub
2. Connect your repo to Netlify
3. Build command: `npm run build`
4. Publish directory: `build`

### Deploy to Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Framework preset: Create React App
4. Deploy

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` folder.

## Development Tips

### Hot Reload
The app uses React hot reloading - changes are reflected immediately.

### Console Logs
Check the browser console for any errors or debug information.

### Add Features
Since there's no backend, you can freely experiment:
- Modify mock data
- Add new pages
- Create new components
- Change styling

## Limitations

As a frontend-only demo, this app has some limitations:

- Data resets on page refresh (no persistence)
- No real user authentication
- Limited to mock data
- No video upload functionality
- Watch progress not saved between sessions

## Future Enhancements

To make this production-ready, you could:

- Add a real backend (Node.js, Python, etc.)
- Connect to a database (MongoDB, PostgreSQL)
- Implement real authentication
- Add video upload/encoding
- Use a CDN for video delivery
- Add payment integration
- Implement recommendations
- Add social features

## Credits

- Built with React
- Sample videos from Google Cloud Storage
- Placeholder images from Picsum
- Inspired by Netflix UI/UX

## License

MIT License - Free to use for learning and development.

---

**Enjoy your Netflix experience!** 🎬🍿
