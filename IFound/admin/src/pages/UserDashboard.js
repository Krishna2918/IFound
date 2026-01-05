import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import RejectionFeedbackModal from '../components/RejectionFeedbackModal';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1';
// Base URL for uploaded images (without /api/v1 suffix)
const UPLOADS_BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1').replace('/api/v1', '');

// Helper to get full image URL
const getImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path; // Already a full URL
  return `${UPLOADS_BASE_URL}${path}`;
};

// Helper to safely format dates
const formatDate = (dateString) => {
  if (!dateString) return 'Recently';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Recently';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Recently';
  }
};

// Helper to convert color names to CSS values for match display
const getColorValue = (colorName) => {
  const colorMap = {
    'black': '#000000',
    'white': '#FFFFFF',
    'red': '#EF4444',
    'green': '#22C55E',
    'blue': '#3B82F6',
    'yellow': '#EAB308',
    'orange': '#F97316',
    'purple': '#A855F7',
    'pink': '#EC4899',
    'brown': '#92400E',
    'gray': '#6B7280',
    'grey': '#6B7280',
    'silver': '#C0C0C0',
    'gold': '#FFD700',
    'beige': '#F5F5DC',
    'navy': '#1E3A8A',
    'teal': '#14B8A6',
  };
  return colorMap[colorName?.toLowerCase()] || '#9CA3AF';
};

// Fix for default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Stable map click handler - defined outside to prevent recreation
const MapClickHandler = React.memo(function MapClickHandler({ onLocationSelect }) {
  useMapEvents({
    click: (e) => {
      onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
});

// Stable marker component
const StableMarker = React.memo(function StableMarker({ position }) {
  if (!position) return null;
  return <Marker position={[position.lat, position.lng]} />;
});

// Map visibility handler - only invalidates once when becoming visible
const MapVisibilityHandler = React.memo(function MapVisibilityHandler({ isVisible }) {
  const map = useMap();
  const hasInvalidated = useRef(false);

  useEffect(() => {
    if (isVisible && map && !hasInvalidated.current) {
      hasInvalidated.current = true;
      // Single delayed invalidation after map becomes visible
      const timer = setTimeout(() => {
        try {
          if (map.getContainer()) {
            map.invalidateSize({ animate: false, pan: false });
          }
        } catch (e) { /* Ignore */ }
      }, 150);
      return () => clearTimeout(timer);
    }
    if (!isVisible) {
      hasInvalidated.current = false;
    }
  }, [isVisible, map]);

  return null;
});

// Map center handler - only recenters when location actually changes
const MapCenterHandler = React.memo(function MapCenterHandler({ center }) {
  const map = useMap();
  const lastCenter = useRef(null);

  useEffect(() => {
    if (center && map) {
      // Only recenter if location actually changed
      const isSameLocation = lastCenter.current &&
        Math.abs(lastCenter.current.lat - center.lat) < 0.0001 &&
        Math.abs(lastCenter.current.lng - center.lng) < 0.0001;

      if (!isSameLocation) {
        lastCenter.current = center;
        try {
          map.setView([center.lat, center.lng], 15, { animate: true, duration: 0.3 });
        } catch (e) { /* Ignore */ }
      }
    }
  }, [center, map]);

  return null;
});

// Memoized map component to prevent re-renders when form fields change
const MemoizedMapSection = React.memo(function MemoizedMapSection({
  showMap,
  selectedLocation,
  onLocationSelect,
  accentColor = 'gray'
}) {
  const mapRef = useRef(null);

  return (
    <div
      className="rounded-2xl overflow-hidden border-2 border-gray-200 shadow-sm"
      style={{
        height: showMap ? '300px' : '0px',
        opacity: showMap ? 1 : 0,
        visibility: showMap ? 'visible' : 'hidden',
        transition: 'height 0.2s ease-out, opacity 0.2s ease-out',
        willChange: 'height, opacity'
      }}
    >
      <MapContainer
        ref={mapRef}
        center={[40.7128, -74.006]}
        zoom={13}
        style={{ height: '300px', width: '100%' }}
        scrollWheelZoom={true}
        zoomAnimation={false}
        fadeAnimation={false}
        markerZoomAnimation={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onLocationSelect={onLocationSelect} />
        <StableMarker position={selectedLocation} />
        <MapVisibilityHandler isVisible={showMap} />
        <MapCenterHandler center={selectedLocation} />
      </MapContainer>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these specific props change
  return prevProps.showMap === nextProps.showMap &&
    prevProps.selectedLocation?.lat === nextProps.selectedLocation?.lat &&
    prevProps.selectedLocation?.lng === nextProps.selectedLocation?.lng &&
    prevProps.onLocationSelect === nextProps.onLocationSelect;
});

export default function UserDashboard() {
  const { user, logout } = useAuth();

  // Dark mode state - persisted in localStorage
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('ifound-dark-mode');
    return saved === 'true';
  });

  // Persist dark mode preference
  useEffect(() => {
    localStorage.setItem('ifound-dark-mode', darkMode.toString());
  }, [darkMode]);

  const [activeTab, setActiveTab] = useState('home');
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [ocrResults, setOcrResults] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  // Location state
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationAddress, setLocationAddress] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);

  // Form states
  const [foundForm, setFoundForm] = useState({
    title: '',
    description: '',
    category: '',
    foundDateTime: '',
  });
  const [findingForm, setFindingForm] = useState({
    title: '',
    description: '',
    category: '',
    bounty: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  // Detail view state
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Matches state
  const [matches, setMatches] = useState([]);
  const [matchStats, setMatchStats] = useState(null);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);

  // Claims state
  const [myClaims, setMyClaims] = useState([]); // Claims I've made as owner
  const [receivedClaims, setReceivedClaims] = useState([]); // Claims on my found items
  const [claimsStats, setClaimsStats] = useState(null);
  const [isLoadingClaims, setIsLoadingClaims] = useState(false);
  const [selectedClaimDetail, setSelectedClaimDetail] = useState(null);

  // Swipe card state
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState(null);
  const cardRef = useRef(null);
  const rafRef = useRef(null);
  const lastDelta = useRef({ x: 0, y: 0 });

  // Found items state (fetched from API)
  const [foundItems, setFoundItems] = useState([]);

  // Lost items state (fetched from API)
  const [lostItems, setLostItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reuniteCount, setReuniteCount] = useState(0);
  const [showMatchesOnly, setShowMatchesOnly] = useState(false);

  // Memoized filtered items for browse (only active/claimed items, optionally matches only)
  const browseItems = useMemo(() =>
    foundItems.filter(item => {
      const isActiveOrClaimed = item.status === 'active' || item.status === 'claimed';
      if (showMatchesOnly) {
        return isActiveOrClaimed && item.isMatch;
      }
      return isActiveOrClaimed;
    }),
    [foundItems, showMatchesOnly]
  );

  // Map category names to backend enum values
  const categoryToItemCategory = {
    'Electronics': 'electronics',
    'Pets': 'pet',
    'Personal Items': 'other',
    'Documents': 'documents',
    'Keys': 'other',
    'Bags': 'other',
    'Other': 'other',
  };

  // Fetch cases from API on mount
  useEffect(() => {
    fetchCases();
    fetchMyCases();
    fetchMatches();
  }, []);

  // Reset card index when filter changes
  useEffect(() => {
    setCurrentCardIndex(0);
  }, [showMatchesOnly]);

  const fetchCases = async () => {
    try {
      const token = localStorage.getItem('adminToken');

      // Use authenticated browse endpoint for match-enriched data
      const endpoint = token ? `${API_URL}/cases/browse?limit=50` : `${API_URL}/cases?status=active&limit=50`;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const response = await fetch(endpoint, { headers });
      const result = await response.json();

      if (result.success) {
        const cases = result.data.cases || [];

        // Separate found items and lost items
        const found = cases
          .filter(c => c.case_type === 'found_item')
          .map(c => ({
            id: c.id,
            title: c.title,
            description: c.description,
            category: c.item_category || 'Other',
            location: c.last_seen_location?.address || 'Unknown location',
            coordinates: c.last_seen_location ? { lat: c.last_seen_location.latitude, lng: c.last_seen_location.longitude } : null,
            date: formatDate(c.last_seen_date || c.created_at),
            foundDateTime: c.last_seen_date,
            status: c.status,
            image: getImageUrl(c.photos?.[0]?.image_url) || 'https://images.unsplash.com/photo-1586769852044-692d6e3703f0?w=400&h=500&fit=crop',
            postedBy: c.poster ? `${c.poster.first_name} ${c.poster.last_name?.charAt(0) || ''}.` : 'Unknown',
            isOwn: false,
            // Match data from browse endpoint
            isMatch: c.isMatch || false,
            matchScore: c.matchScore || 0,
            matchType: c.matchType || null,
            matchReasons: c.matchReasons || [],
            matchId: c.matchId || null,
            matchedIdentifiers: c.matchedIdentifiers || {},
          }));

        const lost = cases
          .filter(c => c.case_type === 'lost_item')
          .map(c => ({
            id: c.id,
            title: c.title,
            description: c.description,
            category: c.item_category || 'Other',
            location: c.last_seen_location?.address || 'Unknown location',
            coordinates: c.last_seen_location ? { lat: c.last_seen_location.latitude, lng: c.last_seen_location.longitude } : null,
            bounty: parseFloat(c.bounty_amount) || 0,
            date: formatDate(c.last_seen_date || c.created_at),
            status: c.status,
            image: getImageUrl(c.photos?.[0]?.image_url),
            postedBy: c.poster ? `${c.poster.first_name} ${c.poster.last_name?.charAt(0) || ''}.` : 'Unknown',
            isOwn: false,
            // Match data from browse endpoint
            isMatch: c.isMatch || false,
            matchScore: c.matchScore || 0,
            matchType: c.matchType || null,
            matchReasons: c.matchReasons || [],
            matchId: c.matchId || null,
            matchedIdentifiers: c.matchedIdentifiers || {},
          }));

        // If API returns data, use it; otherwise keep sample data
        // Filter out items that already exist as own items to prevent duplicates
        if (found.length > 0) {
          setFoundItems(prev => {
            const ownItems = prev.filter(i => i.isOwn);
            const ownIds = ownItems.map(i => i.id);
            const newPublicItems = found.filter(i => !ownIds.includes(i.id));
            return [...ownItems, ...newPublicItems];
          });
        }
        if (lost.length > 0) {
          setLostItems(prev => {
            const ownItems = prev.filter(i => i.isOwn);
            const ownIds = ownItems.map(i => i.id);
            const newPublicItems = lost.filter(i => !ownIds.includes(i.id));
            return [...ownItems, ...newPublicItems];
          });
        }
      }

      // Fetch completed cases count for "Reunited" stat
      const completedResponse = await fetch(`${API_URL}/cases?status=completed&limit=1`);
      const completedResult = await completedResponse.json();
      if (completedResult.success) {
        setReuniteCount(completedResult.data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Error fetching cases:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMyCases = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/cases/my/cases`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();

      if (result.success) {
        const myCases = result.data.cases || [];

        const myFound = myCases
          .filter(c => c.case_type === 'found_item' && c.status !== 'archived' && c.status !== 'completed')
          .map(c => ({
            id: c.id,
            title: c.title,
            description: c.description,
            category: c.item_category || 'Other',
            location: c.last_seen_location?.address || 'Unknown location',
            date: formatDate(c.last_seen_date || c.created_at),
            foundDateTime: c.last_seen_date,
            status: c.status,
            image: getImageUrl(c.photos?.[0]?.image_url) || 'https://images.unsplash.com/photo-1586769852044-692d6e3703f0?w=400&h=500&fit=crop',
            postedBy: 'You',
            isOwn: true,
          }));

        const myLost = myCases
          .filter(c => c.case_type === 'lost_item' && c.status !== 'archived' && c.status !== 'completed')
          .map(c => ({
            id: c.id,
            title: c.title,
            description: c.description,
            category: c.item_category || 'Other',
            location: c.last_seen_location?.address || 'Unknown location',
            bounty: parseFloat(c.bounty_amount) || 0,
            date: formatDate(c.last_seen_date || c.created_at),
            status: c.status,
            image: getImageUrl(c.photos?.[0]?.image_url),
            postedBy: 'You',
            isOwn: true,
          }));

        if (myFound.length > 0) {
          setFoundItems(prev => {
            const myIds = myFound.map(i => i.id);
            const otherItems = prev.filter(i => !i.isOwn && !myIds.includes(i.id));
            // Put user's own items at the END so they see others' items first
            return [...otherItems, ...myFound];
          });
        }
        if (myLost.length > 0) {
          setLostItems(prev => {
            const myIds = myLost.map(i => i.id);
            const otherItems = prev.filter(i => !i.isOwn && !myIds.includes(i.id));
            // Put user's own items at the END so they see others' items first
            return [...otherItems, ...myLost];
          });
        }
      }
    } catch (error) {
      console.error('Error fetching my cases:', error);
    }
  };

  // Fetch matches from API
  const fetchMatches = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsLoadingMatches(true);
    try {
      const [matchesRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/matches/my-matches`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/matches/stats`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      const matchesResult = await matchesRes.json();
      const statsResult = await statsRes.json();

      if (matchesResult.success) {
        setMatches(matchesResult.data.matches || []);
      }
      if (statsResult.success) {
        setMatchStats(statsResult.data);
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setIsLoadingMatches(false);
    }
  };

  // Fetch claims from API (both made and received)
  const fetchClaims = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsLoadingClaims(true);
    try {
      const [myClaimsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/claims/my-claims`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/claims/stats`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      const myClaimsResult = await myClaimsRes.json();
      const statsResult = await statsRes.json();

      if (myClaimsResult.success) {
        setMyClaims(myClaimsResult.data.claims || []);
      }
      if (statsResult.success) {
        setClaimsStats(statsResult.data);
      }

      // Fetch received claims for each of user's found items
      const myFoundItems = foundItems.filter(i => i.isOwn);
      const receivedClaimsPromises = myFoundItems.map(item =>
        fetch(`${API_URL}/claims/case/${item.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }).then(res => res.json())
      );

      const receivedClaimsResults = await Promise.all(receivedClaimsPromises);
      const allReceivedClaims = receivedClaimsResults
        .filter(r => r.success)
        .flatMap(r => r.data.claims || []);

      setReceivedClaims(allReceivedClaims);
    } catch (error) {
      console.error('Error fetching claims:', error);
    } finally {
      setIsLoadingClaims(false);
    }
  };

  // Handle accept claim
  const handleAcceptClaim = async (claimId) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/claims/${claimId}/accept`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      if (result.success) {
        alert('Claim accepted! You can now arrange the handover with the owner.');
        fetchClaims();
      } else {
        alert(result.message || 'Failed to accept claim');
      }
    } catch (error) {
      console.error('Error accepting claim:', error);
      alert('Failed to connect to server');
    }
  };

  // Handle reject claim
  const handleRejectClaim = async (claimId, reason) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/claims/${claimId}/reject`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rejection_reason: reason }),
      });

      const result = await response.json();
      if (result.success) {
        alert('Claim rejected');
        fetchClaims();
      } else {
        alert(result.message || 'Failed to reject claim');
      }
    } catch (error) {
      console.error('Error rejecting claim:', error);
      alert('Failed to connect to server');
    }
  };

  // Upload photos to a case and return the server URLs
  const uploadPhotosToCase = async (caseId, photos) => {
    console.log('=== uploadPhotosToCase called ===');
    console.log('caseId:', caseId);
    console.log('photos array length:', photos?.length);
    console.log('photos:', photos);

    const token = localStorage.getItem('adminToken');
    console.log('token exists:', !!token);

    if (!token) {
      console.error('No token found - cannot upload photos');
      return [];
    }

    if (!photos || photos.length === 0) {
      console.log('No photos to upload');
      return [];
    }

    const formData = new FormData();
    let fileCount = 0;

    photos.forEach((photo, index) => {
      console.log(`Photo ${index}:`, {
        id: photo.id,
        name: photo.name,
        hasFile: !!photo.file,
        fileType: photo.file?.type,
        fileSize: photo.file?.size,
        hasPreviewUrl: !!photo.previewUrl,
      });

      if (photo.file) {
        console.log(`Appending file ${index}:`, photo.file.name, photo.file.size, 'bytes');
        formData.append('photos', photo.file);
        fileCount++;
      } else {
        console.error(`Photo ${index} missing file property! Keys:`, Object.keys(photo));
      }
    });

    console.log('Total files to upload:', fileCount);

    if (fileCount === 0) {
      console.error('No valid files to upload - all photos missing file property');
      return [];
    }

    try {
      const uploadUrl = `${API_URL}/photos/${caseId}/photos`;
      console.log('Uploading to URL:', uploadUrl);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      console.log('Response status:', response.status, response.statusText);

      const result = await response.json();
      console.log('Photo upload response:', result);

      if (result.success && result.data?.photos) {
        const urls = result.data.photos.map(p => p.image_url);
        console.log('Successfully uploaded! Photo URLs:', urls);
        return urls;
      }

      console.error('Photo upload failed:', result.message || 'Unknown error');
      return [];
    } catch (error) {
      console.error('Error uploading photos:', error);
      return [];
    }
  };

  // Handle "I Found" form submission
  const handleFoundSubmit = async (e) => {
    e.preventDefault();
    console.log('=== handleFoundSubmit called ===');
    console.log('uploadedPhotos at submit time:', uploadedPhotos);
    console.log('uploadedPhotos.length:', uploadedPhotos.length);

    if (!foundForm.title || !foundForm.description || !foundForm.category) {
      setUploadError('Please fill in all required fields');
      return;
    }

    if (!locationAddress) {
      setUploadError('Please select a location on the map');
      return;
    }

    if (!foundForm.foundDateTime) {
      setUploadError('Please enter when you found the item');
      return;
    }

    setIsSubmitting(true);
    setUploadError('');

    const token = localStorage.getItem('adminToken');

    try {
      // Create case via API
      const response = await fetch(`${API_URL}/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          case_type: 'found_item',
          title: foundForm.title,
          description: foundForm.description,
          bounty_amount: 0,
          item_category: categoryToItemCategory[foundForm.category] || 'other',
          last_seen_location: {
            address: locationAddress,
            latitude: selectedLocation?.lat,
            longitude: selectedLocation?.lng,
          },
          found_date_time: foundForm.foundDateTime,
        }),
      });

      const result = await response.json();
      console.log('Case creation response:', result);

      if (result.success) {
        const createdCase = result.data.case;
        console.log('Case created with ID:', createdCase.id);
        console.log('uploadedPhotos after case creation:', uploadedPhotos);
        console.log('Has photos to upload:', uploadedPhotos.length > 0);

        // Upload photos if any and get server URLs
        let serverPhotoUrls = [];
        if (uploadedPhotos.length > 0) {
          console.log('Calling uploadPhotosToCase...');
          serverPhotoUrls = await uploadPhotosToCase(createdCase.id, uploadedPhotos);
          console.log('Upload returned URLs:', serverPhotoUrls);
        } else {
          console.log('No photos to upload - uploadedPhotos is empty');
        }

        // Create local item for immediate display using server URLs (with full base URL)
        const fullImageUrls = serverPhotoUrls.map(url => getImageUrl(url));
        const newItem = {
          id: createdCase.id,
          title: foundForm.title,
          description: foundForm.description,
          category: foundForm.category,
          location: locationAddress,
          coordinates: selectedLocation,
          date: formatDate(foundForm.foundDateTime),
          foundDateTime: foundForm.foundDateTime,
          status: 'active',
          image: fullImageUrls.length > 0 ? fullImageUrls[0] : 'https://images.unsplash.com/photo-1586769852044-692d6e3703f0?w=400&h=500&fit=crop',
          postedBy: 'You',
          isOwn: true,
          photos: fullImageUrls.map((url, i) => ({ url, ocr: uploadedPhotos[i]?.ocr })),
        };

        // Add to found items (at the beginning) - replace any existing item with same ID
        setFoundItems(prev => [newItem, ...prev.filter(i => i.id !== createdCase.id)]);

        // Reset form
        setFoundForm({ title: '', description: '', category: '', foundDateTime: '' });
        setLocationAddress('');
        setSelectedLocation(null);
        setShowMap(false);
        setUploadedPhotos([]);
        setOcrResults([]);

        setSubmitSuccess('found');

        // Auto-hide success message
        setTimeout(() => setSubmitSuccess(null), 3000);

        // Switch to My Posts tab
        setTimeout(() => setActiveTab('my-posts'), 1500);
      } else {
        setUploadError(result.message || 'Failed to create case');
      }
    } catch (error) {
      console.error('Error creating case:', error);
      setUploadError('Failed to connect to server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle "I Am Finding" form submission
  const handleFindingSubmit = async (e) => {
    e.preventDefault();

    if (!findingForm.title || !findingForm.description || !findingForm.category) {
      setUploadError('Please fill in all required fields');
      return;
    }

    if (!locationAddress) {
      setUploadError('Please select a location on the map');
      return;
    }

    const findersFee = parseFloat(findingForm.bounty) || 0;
    if (findersFee > 50) {
      setUploadError("Finder's Fee cannot exceed $50 CAD");
      return;
    }

    setIsSubmitting(true);
    setUploadError('');

    const token = localStorage.getItem('adminToken');

    try {
      // Create case via API
      const response = await fetch(`${API_URL}/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          case_type: 'lost_item',
          title: findingForm.title,
          description: findingForm.description,
          bounty_amount: findersFee,
          item_category: categoryToItemCategory[findingForm.category] || 'other',
          last_seen_location: {
            address: locationAddress,
            latitude: selectedLocation?.lat,
            longitude: selectedLocation?.lng,
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        const createdCase = result.data.case;

        // Upload photos if any and get server URLs
        let serverPhotoUrls = [];
        if (uploadedPhotos.length > 0) {
          serverPhotoUrls = await uploadPhotosToCase(createdCase.id, uploadedPhotos);
        }

        // Create local item for immediate display using server URLs (with full base URL)
        const fullImageUrls = serverPhotoUrls.map(url => getImageUrl(url));
        const newItem = {
          id: createdCase.id,
          title: findingForm.title,
          description: findingForm.description,
          category: findingForm.category,
          location: locationAddress,
          coordinates: selectedLocation,
          bounty: findersFee,
          platformFee: findersFee * 0.025,
          finderReceives: findersFee * 0.975,
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          status: 'active',
          image: fullImageUrls.length > 0 ? fullImageUrls[0] : null,
          postedBy: 'You',
          isOwn: true,
          photos: fullImageUrls.map((url, i) => ({ url, ocr: uploadedPhotos[i]?.ocr })),
        };

        // Add to lost items - replace any existing item with same ID
        setLostItems(prev => [newItem, ...prev.filter(i => i.id !== createdCase.id)]);

        // Reset form
        setFindingForm({ title: '', description: '', category: '', bounty: '' });
        setLocationAddress('');
        setSelectedLocation(null);
        setShowMap(false);
        setUploadedPhotos([]);
        setOcrResults([]);

        setSubmitSuccess('finding');

        // Auto-hide success message
        setTimeout(() => setSubmitSuccess(null), 3000);

        // Switch to My Posts tab
        setTimeout(() => setActiveTab('my-posts'), 1500);
      } else {
        setUploadError(result.message || 'Failed to create case');
      }
    } catch (error) {
      console.error('Error creating case:', error);
      setUploadError('Failed to connect to server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Swipe handlers with requestAnimationFrame for smooth performance
  const handleDragStart = useCallback((e) => {
    // Don't start drag if clicking on a button or interactive element
    const target = e.target;
    if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('textarea')) {
      return; // Let the button/link handle its own click
    }

    e.preventDefault();
    const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX, y: clientY });
    lastDelta.current = { x: 0, y: 0 };
    setIsDragging(true);
  }, []);

  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;

    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    const deltaX = clientX - dragStart.x;
    const deltaY = clientY - dragStart.y;

    // Store the latest delta
    lastDelta.current = { x: deltaX, y: deltaY };

    // Use RAF for smooth updates
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setDragDelta({ x: lastDelta.current.x, y: lastDelta.current.y });
    });
  }, [isDragging, dragStart]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    setIsDragging(false);

    const threshold = 80;
    const delta = lastDelta.current;

    if (delta.x > threshold) {
      goToPrevCard();
    } else if (delta.x < -threshold) {
      goToNextCard();
    }

    // Smooth reset
    setDragDelta({ x: 0, y: 0 });
    lastDelta.current = { x: 0, y: 0 };
  }, [isDragging]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const goToNextCard = () => {
    setCurrentCardIndex((prev) => (prev + 1) % browseItems.length);
  };

  const goToPrevCard = () => {
    setCurrentCardIndex((prev) => (prev - 1 + browseItems.length) % browseItems.length);
  };

  // Handle photo upload and OCR analysis
  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    console.log('=== handlePhotoUpload called ===');
    console.log('Selected files:', files.length);

    if (files.length === 0) return;

    setUploadError('');
    setIsAnalyzing(true);

    // Create photo entries with file references IMMEDIATELY
    const newPhotos = files.map(file => {
      console.log('Processing file:', file.name, 'size:', file.size, 'type:', file.type);
      const previewUrl = URL.createObjectURL(file);
      const photoEntry = {
        id: Date.now() + Math.random() + file.name,
        file,  // Store the file object immediately
        previewUrl,
        name: file.name,
        analyzing: true,
        ocr: null,
      };
      console.log('Created photoEntry with file:', !!photoEntry.file, 'file size:', photoEntry.file?.size);
      return photoEntry;
    });

    // Add photos to state IMMEDIATELY so they're available for submission
    console.log('Adding photos to state IMMEDIATELY:', newPhotos.length);
    setUploadedPhotos(prev => [...prev, ...newPhotos]);

    // Run OCR analysis in background and update state when complete
    for (const photoEntry of newPhotos) {
      try {
        const formData = new FormData();
        formData.append('image', photoEntry.file);

        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_URL}/photos/analyze-ocr`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });

        const result = await response.json();

        // Update the photo entry in state with OCR results
        setUploadedPhotos(prev => prev.map(p => {
          if (p.id === photoEntry.id) {
            if (result.success) {
              return { ...p, ocr: result.data, analyzing: false };
            } else {
              return { ...p, ocr: { error: result.message || 'OCR analysis failed' }, analyzing: false };
            }
          }
          return p;
        }));

        if (result.success) {
          setOcrResults(prev => [...prev, { photoId: photoEntry.id, ...result.data }]);
        }
      } catch (err) {
        console.error('OCR analysis error:', err);
        // Update photo entry to show error
        setUploadedPhotos(prev => prev.map(p => {
          if (p.id === photoEntry.id) {
            return { ...p, ocr: { error: 'Failed to connect to server' }, analyzing: false };
          }
          return p;
        }));
      }
    }

    setIsAnalyzing(false);
    console.log('OCR analysis complete for all photos');
  };

  const removePhoto = (photoId) => {
    setUploadedPhotos(prev => prev.filter(p => p.id !== photoId));
    setOcrResults(prev => prev.filter(r => r.photoId !== photoId));
  };

  // Delete a case/item
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, title, type }
  const [isDeleting, setIsDeleting] = useState(false);

  // Claim modal state
  const [claimModal, setClaimModal] = useState(null); // { item: foundItem }
  const [claimForm, setClaimForm] = useState({
    verificationDescription: '',
    bountyOffered: '',
    proofPhoto: null,
  });
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  const [claimError, setClaimError] = useState('');
  const claimProofInputRef = useRef(null);

  // Link to existing lost post state
  const [userLostPosts, setUserLostPosts] = useState([]); // User's active lost item posts
  const [selectedLostPost, setSelectedLostPost] = useState(null); // Selected lost post to link
  const [isLoadingLostPosts, setIsLoadingLostPosts] = useState(false);

  // Payment flow state
  const [paymentStep, setPaymentStep] = useState('form'); // 'form', 'payment', 'processing', 'success'
  const [paymentForm, setPaymentForm] = useState({
    cardNumber: '',
    expiry: '',
    cvv: '',
    name: '',
  });
  const [submittedClaimData, setSubmittedClaimData] = useState(null);

  // Chat state
  const [chatModal, setChatModal] = useState(null); // { claim, otherParty, itemTitle }
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isConfirmingHandover, setIsConfirmingHandover] = useState(false);
  const chatMessagesEndRef = useRef(null);
  const chatFileInputRef = useRef(null);

  // Earnings state
  const [earnings, setEarnings] = useState(null);
  const [isLoadingEarnings, setIsLoadingEarnings] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState(false);

  // Match feedback state
  const [rejectionModal, setRejectionModal] = useState(null); // { matchId, matchScore }
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Handle match feedback submission (confirm or reject)
  const handleMatchFeedback = async (matchId, feedback, rejectionData = null) => {
    setIsSubmittingFeedback(true);
    const token = localStorage.getItem('adminToken');

    try {
      const body = { feedback };
      if (feedback === 'rejected' && rejectionData) {
        body.rejection_reasons = rejectionData.rejection_reasons;
        body.rejection_details = rejectionData.rejection_details;
      }

      const response = await fetch(`${API_URL}/matches/${matchId}/feedback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (result.success) {
        // Update local match state if needed
        setUserMatches(prev => prev.map(m =>
          m.id === matchId ? { ...m, status: feedback } : m
        ));
        setRejectionModal(null);
        setSelectedMatch(null);
        // Could show a success toast here
      } else {
        alert(result.message || 'Failed to submit feedback');
      }
    } catch (error) {
      console.error('Error submitting match feedback:', error);
      alert('Failed to connect to server');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleDeleteItem = async (item, type) => {
    setIsDeleting(true);
    const token = localStorage.getItem('adminToken');

    try {
      const response = await fetch(`${API_URL}/cases/${item.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        // Remove from local state
        if (type === 'found') {
          setFoundItems(prev => prev.filter(i => i.id !== item.id));
        } else {
          setLostItems(prev => prev.filter(i => i.id !== item.id));
        }
        setDeleteConfirm(null);
        // Close detail view if open
        if (selectedItem?.id === item.id) {
          setSelectedItem(null);
        }
      } else {
        alert(result.message || 'Failed to delete item');
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to connect to server');
    } finally {
      setIsDeleting(false);
    }
  };

  // Get the effective bounty amount (from linked lost post or manual entry)
  const getEffectiveBounty = () => {
    if (selectedLostPost) {
      return parseFloat(selectedLostPost.bounty_amount) || 0;
    }
    return parseFloat(claimForm.bountyOffered) || 0;
  };

  // Handle proceeding to payment step
  const handleProceedToPayment = () => {
    if (!claimModal?.item) return;

    if (!claimForm.verificationDescription.trim()) {
      setClaimError('Please describe unique identifying features of your item');
      return;
    }

    // Store claim data and proceed to payment
    // Use bounty from linked lost post if available
    const effectiveBounty = getEffectiveBounty();

    setSubmittedClaimData({
      found_case_id: claimModal.item.id,
      verification_description: claimForm.verificationDescription.trim(),
      bounty_offered: effectiveBounty,
      lost_case_id: selectedLostPost?.id || null, // Link to existing lost post
    });
    setClaimError('');
    setPaymentStep('payment');
  };

  // Handle test payment and claim submission
  const handlePaymentSubmit = async () => {
    // Validate payment form (basic validation for test)
    if (!paymentForm.cardNumber || !paymentForm.expiry || !paymentForm.cvv || !paymentForm.name) {
      setClaimError('Please fill in all payment fields');
      return;
    }

    setPaymentStep('processing');
    setClaimError('');

    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    const token = localStorage.getItem('adminToken');
    if (!token) {
      setClaimError('Please log in to claim this item');
      setPaymentStep('payment');
      return;
    }

    try {
      // Submit the claim after "payment"
      const response = await fetch(`${API_URL}/claims`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submittedClaimData),
      });

      const result = await response.json();

      if (result.success) {
        // Show success step
        setPaymentStep('success');
      } else {
        setClaimError(result.message || 'Failed to submit claim');
        setPaymentStep('payment');
      }
    } catch (error) {
      console.error('Error submitting claim:', error);
      setClaimError('Failed to connect to server. Please try again.');
      setPaymentStep('payment');
    }
  };

  // Handle closing claim modal and navigating to claims tab
  const handleClaimSuccess = () => {
    setClaimModal(null);
    setClaimForm({ verificationDescription: '', bountyOffered: '', proofPhoto: null });
    setPaymentForm({ cardNumber: '', expiry: '', cvv: '', name: '' });
    setPaymentStep('form');
    setSubmittedClaimData(null);
    setClaimError('');
    // Navigate to claims tab
    setActiveTab('claims');
    fetchClaims();
  };

  // Chat Functions
  const openChat = async (claim, otherParty, itemTitle) => {
    setChatModal({ claim, otherParty, itemTitle });
    setChatMessages([]);
    setChatInput('');
    setIsLoadingChat(true);

    const token = localStorage.getItem('adminToken');
    try {
      const response = await fetch(`${API_URL}/messages/claim/${claim.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await response.json();
      if (result.success) {
        setChatMessages(result.data.messages || []);
      }
    } catch (error) {
      console.error('Error loading chat:', error);
    } finally {
      setIsLoadingChat(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !chatModal || isSendingMessage) return;

    const token = localStorage.getItem('adminToken');
    setIsSendingMessage(true);

    try {
      const response = await fetch(`${API_URL}/messages/claim/${chatModal.claim.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: chatInput.trim() }),
      });

      const result = await response.json();
      if (result.success) {
        setChatMessages(prev => [...prev, result.data.message]);
        setChatInput('');
        // Scroll to bottom
        setTimeout(() => {
          chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const closeChat = () => {
    setChatModal(null);
    setChatMessages([]);
    setChatInput('');
  };

  // Upload file in chat
  const uploadChatFile = async (file) => {
    if (!file || !chatModal || isUploadingFile) return;

    const token = localStorage.getItem('adminToken');
    setIsUploadingFile(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_URL}/messages/claim/${chatModal.claim.id}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        setChatMessages(prev => [...prev, result.data.message]);
        setTimeout(() => {
          chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        alert(result.message || 'Failed to upload file');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file');
    } finally {
      setIsUploadingFile(false);
      if (chatFileInputRef.current) {
        chatFileInputRef.current.value = '';
      }
    }
  };

  // Handle file input change
  const handleChatFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadChatFile(file);
    }
  };

  // Confirm handover (mark transaction complete)
  const confirmHandover = async () => {
    if (!chatModal || isConfirmingHandover) return;

    const token = localStorage.getItem('adminToken');
    setIsConfirmingHandover(true);

    try {
      const response = await fetch(`${API_URL}/claims/${chatModal.claim.id}/confirm-handover`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      if (result.success) {
        // Add system message about confirmation
        const systemMsg = {
          id: 'system-' + Date.now(),
          message_type: 'system',
          content: result.message,
          createdAt: new Date().toISOString(),
        };
        setChatMessages(prev => [...prev, systemMsg]);

        // Update claim in chatModal
        setChatModal(prev => ({
          ...prev,
          claim: result.data.claim,
        }));

        // Refresh claims list
        fetchClaims();
      } else {
        alert(result.message || 'Failed to confirm handover');
      }
    } catch (error) {
      console.error('Error confirming handover:', error);
      alert('Failed to confirm handover');
    } finally {
      setIsConfirmingHandover(false);
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatMessages.length > 0) {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // Fetch earnings
  const fetchEarnings = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsLoadingEarnings(true);
    try {
      const response = await fetch(`${API_URL}/payments/earnings`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await response.json();
      if (result.success) {
        setEarnings(result.data);
      }
    } catch (error) {
      console.error('Error fetching earnings:', error);
    } finally {
      setIsLoadingEarnings(false);
    }
  };

  // Request withdrawal
  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    const token = localStorage.getItem('adminToken');
    setIsWithdrawing(true);

    try {
      const response = await fetch(`${API_URL}/payments/withdraw`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount, payout_method: 'bank_transfer' }),
      });

      const result = await response.json();
      if (result.success) {
        alert(result.message);
        setWithdrawModal(false);
        setWithdrawAmount('');
        fetchEarnings(); // Refresh earnings
      } else {
        alert(result.message || 'Failed to request withdrawal');
      }
    } catch (error) {
      console.error('Error requesting withdrawal:', error);
      alert('Failed to request withdrawal');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Open claim modal for a found item
  const openClaimModal = async (item) => {
    setClaimModal({ item });
    setClaimForm({ verificationDescription: '', bountyOffered: '', proofPhoto: null });
    setPaymentForm({ cardNumber: '', expiry: '', cvv: '', name: '' });
    setPaymentStep('form');
    setClaimError('');
    setSelectedLostPost(null);
    setUserLostPosts([]);

    // Fetch user's active lost posts to allow linking
    const token = localStorage.getItem('adminToken');
    if (token) {
      setIsLoadingLostPosts(true);
      try {
        const response = await fetch(`${API_URL}/cases/my/cases`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const result = await response.json();
        if (result.success) {
          // Filter for active lost items only
          const activeLostPosts = (result.data.cases || []).filter(
            c => c.case_type === 'lost_item' && c.status === 'active'
          );
          setUserLostPosts(activeLostPosts);
        }
      } catch (error) {
        console.error('Error fetching lost posts:', error);
      } finally {
        setIsLoadingLostPosts(false);
      }
    }
  };

  const getScoreColor = (score) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-gray-500';
  };

  const getScoreBgColor = (score) => {
    if (score >= 70) return 'bg-green-100';
    if (score >= 40) return 'bg-yellow-100';
    return 'bg-gray-100';
  };

  // Color mapping for DNA display
  const DNA_COLOR_MAP = {
    RED: '#EF4444', ORG: '#F97316', YEL: '#EAB308', GRN: '#22C55E',
    CYN: '#06B6D4', BLU: '#3B82F6', PUR: '#A855F7', PNK: '#EC4899',
    BRN: '#92400E', BLK: '#1F2937', WHT: '#F9FAFB', GRY: '#6B7280',
    GLD: '#D97706', SLV: '#9CA3AF', BGE: '#D2B48C', TAN: '#D2B48C',
  };

  // Entity icons for DNA display
  const ENTITY_ICONS = {
    PET: '🐾', DOC: '📄', VEH: '🚗', PER: '👤', ITM: '📦', UNK: '❓',
  };

  // Check if OCR text is garbage (nonsensical characters, random spacing)
  const isGarbageOCR = (text, confidence) => {
    if (!text || confidence < 40) return true;
    // Check for excessive special characters or random spacing patterns
    const garbagePattern = /^[\s\W\d]*$|([A-Z]\s){4,}|[^\w\s]{3,}/;
    const wordCount = text.split(/\s+/).filter(w => w.length > 2).length;
    const avgWordLength = text.replace(/\s/g, '').length / Math.max(wordCount, 1);
    return garbagePattern.test(text) || avgWordLength < 2 || wordCount < 2;
  };

  // Visual DNA Display Component (replaces OCR when garbage)
  const VisualDNADisplay = ({ ocr }) => {
    if (!ocr || ocr.error) {
      return (
        <div className="mt-2 p-3 bg-red-50 rounded-xl text-sm text-red-600">
          {ocr?.error || 'Analysis pending...'}
        </div>
      );
    }

    const score = ocr.score || 0;
    const identifiers = ocr.identifiers || {};
    const hasIdentifiers = Object.values(identifiers).some(arr => arr?.length > 0);
    const dnaId = ocr.dna_v2_id || ocr.dnaId;
    const isGarbage = isGarbageOCR(ocr.text, ocr.confidence);

    // Parse DNA ID if available
    let dnaParts = null;
    if (dnaId) {
      const parts = dnaId.split('-');
      if (parts.length >= 6) {
        dnaParts = {
          entity: parts[0],
          colors: parts[1].split('.'),
          shape: parts[2],
          neural: parts[3],
          hash: parts[4],
          quality: parts[5],
        };
      }
    }

    return (
      <div className="mt-3 space-y-3">
        {/* DNA ID Display (Primary) */}
        {dnaId && (
          <div className="p-3 bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Visual DNA</span>
              {dnaParts && (
                <span className="text-lg">{ENTITY_ICONS[dnaParts.entity] || '📷'}</span>
              )}
            </div>
            <p className="font-mono text-sm text-emerald-400 font-bold tracking-wide">
              {dnaId}
            </p>
            {dnaParts && (
              <div className="flex items-center gap-2 mt-2">
                {dnaParts.colors.map((color, i) => (
                  <div
                    key={i}
                    className="w-4 h-4 rounded-full border border-white/30"
                    style={{ backgroundColor: DNA_COLOR_MAP[color] || '#6B7280' }}
                    title={color}
                  />
                ))}
                <span className="text-xs text-slate-400 ml-2">
                  {dnaParts.shape} • Q{dnaParts.quality.replace('Q', '')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Quality Score */}
        <div className={`flex items-center justify-between p-3 rounded-xl ${getScoreBgColor(score)}`}>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="font-medium text-gray-700">Analysis Score</span>
          </div>
          <div className={`text-2xl font-bold ${getScoreColor(score)}`}>
            {score}/100
          </div>
        </div>

        {/* Detected Identifiers (only if found) */}
        {hasIdentifiers && (
          <div className="p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Detected Identifiers</h4>
            <div className="flex flex-wrap gap-2">
              {identifiers.serialNumbers?.map((sn, i) => (
                <span key={i} className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                  S/N: {sn}
                </span>
              ))}
              {identifiers.licensePlates?.map((lp, i) => (
                <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                  Plate: {lp}
                </span>
              ))}
              {identifiers.documentIds?.map((id, i) => (
                <span key={i} className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                  ID: {id}
                </span>
              ))}
              {identifiers.emails?.map((email, i) => (
                <span key={i} className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                  {email}
                </span>
              ))}
              {identifiers.phones?.map((phone, i) => (
                <span key={i} className="px-2 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-medium">
                  {phone}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* OCR Text - ONLY if valid (not garbage) */}
        {ocr.text && ocr.text.trim() && !isGarbage && (
          <div className="p-3 bg-gray-50 rounded-xl">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Extracted Text</h4>
            <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-4">
              {ocr.text.slice(0, 200)}{ocr.text.length > 200 ? '...' : ''}
            </p>
          </div>
        )}

        {/* Show message if OCR was garbage AND no identifiers found but DNA is available */}
        {isGarbage && dnaId && !hasIdentifiers && (
          <div className="p-2 bg-amber-50 rounded-xl text-xs text-amber-700">
            No readable text detected - using Visual DNA for matching
          </div>
        )}

        {/* Show success message if identifiers were detected */}
        {hasIdentifiers && (
          <div className="p-2 bg-green-50 rounded-xl text-xs text-green-700">
            ✓ Document identifiers detected - ready for matching
          </div>
        )}

        <div className="text-xs text-gray-400 text-right">
          Processed in {ocr.processingTimeMs || 0}ms
        </div>
      </div>
    );
  };

  // Legacy OCR Score Display (keeping for backwards compatibility)
  const OCRScoreDisplay = VisualDNADisplay;

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);

  // Handle drag and drop
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files).filter(file =>
      file.type.startsWith('image/')
    );

    if (files.length > 0) {
      // Create a fake event object to reuse handlePhotoUpload
      const fakeEvent = { target: { files } };
      handlePhotoUpload(fakeEvent);
    }
  }, []);

  // Photo Upload Section Component
  const PhotoUploadSection = ({ accentColor = 'gray' }) => {
    const colorClasses = {
      green: {
        border: 'border-green-300 hover:border-green-400',
        borderActive: 'border-green-500',
        bg: 'bg-green-50',
        bgActive: 'bg-green-100',
        text: 'text-green-600',
        ring: 'ring-green-500/30',
      },
      blue: {
        border: 'border-blue-300 hover:border-blue-400',
        borderActive: 'border-blue-500',
        bg: 'bg-blue-50',
        bgActive: 'bg-blue-100',
        text: 'text-blue-600',
        ring: 'ring-blue-500/30',
      },
      gray: {
        border: 'border-gray-300 hover:border-gray-400',
        borderActive: 'border-gray-500',
        bg: 'bg-gray-50',
        bgActive: 'bg-gray-100',
        text: 'text-gray-600',
        ring: 'ring-gray-500/30',
      },
    };
    const colors = colorClasses[accentColor] || colorClasses.gray;

    return (
      <div className="space-y-4">
        <label className="block text-gray-700 font-medium mb-2">
          Upload Photos (Optional)
          <span className="text-gray-400 font-normal ml-2">- OCR will scan for serial numbers, IDs, etc.</span>
        </label>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
            isDragOver
              ? `${colors.borderActive} ${colors.bgActive} ring-4 ${colors.ring} scale-[1.02]`
              : `${colors.border} ${colors.bg}`
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />

          {/* Drag overlay */}
          {isDragOver && (
            <div className={`absolute inset-0 flex items-center justify-center rounded-2xl z-10 ${darkMode ? 'bg-gray-800/90' : 'bg-white/80'}`}>
              <div className="text-center">
                <svg className={`w-12 h-12 mx-auto ${colors.text} mb-2 animate-bounce`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className={`${colors.text} font-semibold text-lg`}>Drop photos here!</p>
              </div>
            </div>
          )}

          <svg className={`w-10 h-10 mx-auto ${colors.text} mb-2 transition-transform ${isDragOver ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className={`${colors.text} font-medium`}>
            Drag & drop photos here or click to browse
          </p>
          <p className="text-gray-400 text-sm mt-1">JPG, PNG, GIF, WebP up to 10MB</p>
        </div>

        {uploadedPhotos.length > 0 && (
          <div className="space-y-4">
            <h4 className={`font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Uploaded Photos ({uploadedPhotos.length})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {uploadedPhotos.map((photo) => (
                <div key={photo.id} className={`rounded-2xl overflow-hidden shadow-sm border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}>
                  <div className="relative">
                    <img
                      src={photo.previewUrl}
                      alt={photo.name}
                      className="w-full h-40 object-cover"
                    />
                    <button
                      onClick={() => removePhoto(photo.id)}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    {photo.analyzing && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="flex items-center gap-2 text-white">
                          <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                          <span>Analyzing...</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-gray-600 truncate">{photo.name}</p>
                    {photo.ocr && <OCRScoreDisplay ocr={photo.ocr} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {uploadError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {uploadError}
          </div>
        )}
      </div>
    );
  };

  // Reverse geocode to get address from coordinates
  const reverseGeocode = async (lat, lng) => {
    setIsLoadingAddress(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await response.json();
      if (data.display_name) {
        setLocationAddress(data.display_name);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setIsLoadingAddress(false);
    }
  };

  // Get user's current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setSelectedLocation({ lat: latitude, lng: longitude });
          reverseGeocode(latitude, longitude);
        },
        (error) => {
          console.error('Geolocation error:', error);
          // Default to a central location if geolocation fails
          setSelectedLocation({ lat: 40.7128, lng: -74.006 });
        }
      );
    }
  };

  // Handler for map location selection - memoized to prevent re-renders
  const handleLocationSelect = useCallback((location) => {
    setSelectedLocation(location);
    reverseGeocode(location.lat, location.lng);
  }, []);

  // Location Picker Component
  const LocationPickerSection = ({ accentColor = 'gray' }) => {
    const colorClasses = {
      green: {
        button: 'bg-green-500 hover:bg-green-600',
        ring: 'ring-green-500',
        text: 'text-green-600',
      },
      blue: {
        button: 'bg-blue-500 hover:bg-blue-600',
        ring: 'ring-blue-500',
        text: 'text-blue-600',
      },
      gray: {
        button: 'bg-gray-700 hover:bg-gray-800',
        ring: 'ring-gray-500',
        text: 'text-gray-600',
      },
    };
    const colors = colorClasses[accentColor] || colorClasses.gray;

    return (
      <div className="space-y-3">
        <label className="block text-gray-700 font-medium">
          Location {accentColor === 'green' ? 'Found' : 'Last Seen'} *
        </label>

        {/* Address Display / Input */}
        <div className="relative">
          <input
            type="text"
            value={locationAddress}
            onChange={(e) => setLocationAddress(e.target.value)}
            className={`w-full px-4 py-3 pr-24 border border-gray-300 rounded-2xl focus:ring-2 focus:${colors.ring} outline-none`}
            placeholder="Click map or use current location"
            readOnly={isLoadingAddress}
          />
          <button
            type="button"
            onClick={() => {
              setShowMap(!showMap);
              if (!selectedLocation) {
                getCurrentLocation();
              }
            }}
            className={`absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 ${colors.button} text-white rounded-xl text-sm font-medium transition-colors`}
          >
            {showMap ? 'Hide Map' : 'Pick on Map'}
          </button>
        </div>

        {/* Map Container - always visible, controls inside handle hiding */}
        <div className={`space-y-3 ${showMap ? '' : 'hidden'}`}>
          {/* Quick Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={getCurrentLocation}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm text-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Use My Location
            </button>
            {isLoadingAddress && (
              <span className="flex items-center gap-2 text-sm text-gray-500">
                <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full" />
                Getting address...
              </span>
            )}
          </div>

          {/* Map - using memoized component to prevent re-renders */}
          <MemoizedMapSection
            showMap={showMap}
            selectedLocation={selectedLocation}
            onLocationSelect={handleLocationSelect}
            accentColor={accentColor}
          />

          {/* Selected Coordinates */}
          {selectedLocation && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span>Lat: {selectedLocation.lat.toFixed(6)}, Lng: {selectedLocation.lng.toFixed(6)}</span>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Click anywhere on the map to set the location, or use "My Location" for GPS.
          </p>
        </div>
      </div>
    );
  };

  // Card Component - Only renders the active card
  const SwipeableCard = ({ item, isActive }) => {
    if (!isActive) {
      return null;
    }

    return (
      <div className="absolute inset-0 w-full h-full">
        <div className={`relative w-full h-full rounded-3xl shadow-2xl overflow-hidden ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
          {/* Image */}
          <div className="relative h-3/5">
            <img
              src={item.image}
              alt={item.title}
              className="w-full h-full object-cover"
            />
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

            {/* Category Badge */}
            <div className="absolute top-4 left-4 flex flex-col gap-2">
              <span className="px-3 py-1.5 bg-green-500 text-white rounded-full text-sm font-medium shadow-lg">
                FOUND
              </span>
              {/* Potential Match Badge */}
              {item.isMatch && (
                <div className={`px-3 py-1.5 rounded-full text-sm font-bold shadow-lg flex items-center gap-1.5 ${
                  item.matchScore >= 75 ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white' :
                  item.matchScore >= 55 ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white' :
                  'bg-gradient-to-r from-gray-500 to-gray-600 text-white'
                }`}>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                  </svg>
                  <span>POTENTIAL MATCH {item.matchScore}%</span>
                </div>
              )}
            </div>

            {/* Status Badge */}
            <div className="absolute top-4 right-4">
              <span className={`px-3 py-1.5 rounded-full text-sm font-medium shadow-lg ${
                item.status === 'active' ? 'bg-white text-green-600' :
                item.status === 'claimed' ? 'bg-white text-blue-600' :
                item.status === 'in_progress' ? 'bg-white text-orange-600' :
                item.status === 'completed' ? 'bg-white text-purple-600' :
                item.status === 'archived' ? 'bg-gray-200 text-gray-600' :
                'bg-gray-200 text-gray-600'
              }`}>
                {item.status === 'active' ? 'Active' :
                 item.status === 'claimed' ? 'Claimed' :
                 item.status === 'in_progress' ? 'In Progress' :
                 item.status === 'completed' ? 'Completed' :
                 item.status === 'archived' ? 'Archived' : item.status}
              </span>
            </div>

            {/* Title on Image */}
            <div className="absolute bottom-4 left-4 right-4">
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">{item.title}</h2>
              <div className="flex items-center gap-2 mt-1">
                <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-white/90 text-sm">{item.location}</span>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="h-2/5 p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                {item.category}
              </span>
              <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>{item.date}</span>
            </div>

            <p className={`text-sm flex-1 overflow-hidden ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {item.description}
            </p>

            {/* Match Reasons */}
            {item.isMatch && item.matchReasons && item.matchReasons.length > 0 && (
              <div className={`mt-2 p-2 rounded-xl ${darkMode ? 'bg-green-900/30 border border-green-700' : 'bg-green-50 border border-green-200'}`}>
                <div className={`text-xs font-semibold mb-1 ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
                  Why it matches:
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.matchReasons.slice(0, 3).map((reason, idx) => (
                    <span key={idx} className={`px-2 py-0.5 rounded-full text-xs ${
                      darkMode ? 'bg-green-800 text-green-200' : 'bg-green-100 text-green-800'
                    }`}>
                      {typeof reason === 'object' ? `${reason.icon || ''} ${reason.text || ''}`.trim() : reason}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className={`flex items-center justify-between mt-3 pt-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full flex items-center justify-center text-white text-xs font-medium">
                  {item.postedBy?.charAt(0)}
                </div>
                <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Posted by {item.postedBy}</span>
              </div>
              {item.isOwn && (
                <span className={`px-3 py-2 rounded-full text-sm font-medium ${darkMode ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-700'}`}>
                  Your Post
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const getCardStyle = (index) => {
    const diff = index - currentCardIndex;
    const isActive = index === currentCardIndex;

    let transform = '';
    let opacity = 1;

    if (isActive && isDragging) {
      const rotation = dragDelta.x * 0.03;
      const yOffset = Math.abs(dragDelta.x) * 0.05;
      transform = `translate3d(${dragDelta.x}px, ${yOffset}px, 0) rotate(${rotation}deg)`;
    } else if (isActive && swipeDirection === 'left') {
      transform = 'translate3d(-120%, 50px, 0) rotate(-12deg)';
      opacity = 0;
    } else if (isActive && swipeDirection === 'right') {
      transform = 'translate3d(120%, 50px, 0) rotate(12deg)';
      opacity = 0;
    } else if (diff === 1 || diff === -(browseItems.length - 1)) {
      transform = 'translate3d(0, 8px, -30px) scale(0.96)';
      opacity = 0.8;
    } else if (diff === 2 || diff === -(browseItems.length - 2)) {
      transform = 'translate3d(0, 16px, -60px) scale(0.92)';
      opacity = 0.5;
    } else if (!isActive) {
      opacity = 0;
      transform = 'translate3d(0, 0, -100px) scale(0.85)';
    } else {
      transform = 'translate3d(0, 0, 0)';
    }

    return {
      transform,
      opacity,
      transition: isDragging
        ? 'none'
        : 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease-out',
    };
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`shadow-lg transition-colors duration-300 ${darkMode ? 'bg-gray-800' : 'bg-gradient-to-r from-gray-900 to-gray-800'} text-white`}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 backdrop-blur-sm rounded-full p-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold">IFound</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-300">Welcome, {user?.first_name}</span>
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {darkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className={`shadow-sm transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-b border-gray-700' : 'bg-white border-b border-gray-200'}`}>
        <div className="max-w-6xl mx-auto px-4">
          <nav className="flex gap-1 overflow-x-auto">
            {[
              { key: 'home', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
              { key: 'found', label: 'I Found', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
              { key: 'finding', label: 'I Am Finding', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
              { key: 'matches', label: 'Matches', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', badge: matchStats?.pending_matches },
              { key: 'claims', label: 'Claims', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', badge: claimsStats?.receivedClaims?.byStatus?.pending || 0 },
              { key: 'my-posts', label: 'My Posts', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setUploadedPhotos([]);
                  setOcrResults([]);
                  if (tab.key === 'matches') fetchMatches();
                  if (tab.key === 'claims') fetchClaims();
                }}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? darkMode
                      ? 'border-blue-400 text-blue-400 font-medium'
                      : 'border-gray-900 text-gray-900 font-medium'
                    : darkMode
                      ? 'border-transparent text-gray-400 hover:text-gray-200'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
                {tab.badge > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {activeTab === 'home' && (
          <div className="space-y-6">
            {/* Header with Actions */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Discover Found Items</h2>
                <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Swipe to browse - Right for back, Left for next</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('found')}
                  className="px-4 py-2 bg-green-500 text-white rounded-full text-sm font-medium hover:bg-green-600 transition-colors"
                >
                  + I Found
                </button>
                <button
                  onClick={() => setActiveTab('finding')}
                  className="px-4 py-2 bg-blue-500 text-white rounded-full text-sm font-medium hover:bg-blue-600 transition-colors"
                >
                  + I'm Finding
                </button>
              </div>
            </div>

            {/* Matches Filter Toggle */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowMatchesOnly(!showMatchesOnly)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  showMatchesOnly
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg'
                    : darkMode
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                </svg>
                <span>Show Matches Only</span>
                {showMatchesOnly && (
                  <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded-full text-xs">
                    {browseItems.length}
                  </span>
                )}
              </button>
              <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {browseItems.length} items to browse
              </div>
            </div>

            {/* Swipeable Cards Container */}
            <div className="flex justify-center" style={{ perspective: '1200px' }}>
              <div
                className="relative w-full max-w-md h-[600px] select-none cursor-grab active:cursor-grabbing"
                style={{ transformStyle: 'preserve-3d' }}
                onMouseDown={handleDragStart}
                onMouseMove={handleDragMove}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
                onTouchStart={handleDragStart}
                onTouchMove={handleDragMove}
                onTouchEnd={handleDragEnd}
                ref={cardRef}
              >
                {browseItems.map((item, index) => (
                  <SwipeableCard
                    key={item.id}
                    item={item}
                    isActive={index === currentCardIndex}
                  />
                ))}

                {/* Swipe Indicators */}
                <div
                  className={`absolute top-1/2 left-4 -translate-y-1/2 z-20 bg-green-500 text-white px-4 py-2 rounded-full font-bold shadow-lg transition-all duration-150 ${
                    isDragging && dragDelta.x > 50
                      ? 'opacity-100 scale-100'
                      : 'opacity-0 scale-75 pointer-events-none'
                  }`}
                  style={{ transform: `translateY(-50%) scale(${isDragging && dragDelta.x > 50 ? Math.min(1 + (dragDelta.x - 50) / 200, 1.2) : 0.75})` }}
                >
                  BACK
                </div>
                <div
                  className={`absolute top-1/2 right-4 -translate-y-1/2 z-20 bg-blue-500 text-white px-4 py-2 rounded-full font-bold shadow-lg transition-all duration-150 ${
                    isDragging && dragDelta.x < -50
                      ? 'opacity-100 scale-100'
                      : 'opacity-0 scale-75 pointer-events-none'
                  }`}
                  style={{ transform: `translateY(-50%) scale(${isDragging && dragDelta.x < -50 ? Math.min(1 + (Math.abs(dragDelta.x) - 50) / 200, 1.2) : 0.75})` }}
                >
                  NEXT
                </div>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-center items-center gap-6">
              <button
                onClick={goToPrevCard}
                className={`w-14 h-14 border-2 rounded-full flex items-center justify-center hover:border-green-500 hover:text-green-500 hover:scale-110 active:scale-95 transition-all duration-200 ease-out shadow-md hover:shadow-lg ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Card Counter */}
              <div className="flex items-center gap-2">
                {foundItems.map((_, index) => (
                  <div
                    key={index}
                    className={`h-2 rounded-full transition-all duration-300 ease-out ${
                      index === currentCardIndex
                        ? (darkMode ? 'bg-white w-8' : 'bg-gray-800 w-8')
                        : (darkMode ? 'bg-gray-600 w-2 hover:bg-gray-500' : 'bg-gray-300 w-2 hover:bg-gray-400')
                    }`}
                    style={{ transitionProperty: 'width, background-color' }}
                  />
                ))}
              </div>

              <button
                onClick={goToNextCard}
                className={`w-14 h-14 border-2 rounded-full flex items-center justify-center hover:border-blue-500 hover:text-blue-500 hover:scale-110 active:scale-95 transition-all duration-200 ease-out shadow-md hover:shadow-lg ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* This Is Mine Button - Outside drag container */}
            {browseItems[currentCardIndex] && !browseItems[currentCardIndex].isOwn && (
              <div className="flex flex-col items-center mt-4 gap-3">
                <button
                  onClick={() => openClaimModal(browseItems[currentCardIndex])}
                  className="px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-full text-lg font-semibold hover:shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  This Is Mine!
                </button>
                <p className="text-xs text-gray-500 text-center max-w-xs">
                  <svg className="w-4 h-4 inline-block mr-1 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  A $5 CAD fee is charged to contact the finder. This helps prevent buying and selling of lost items.
                </p>
              </div>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className={`rounded-2xl p-4 border shadow-sm text-center transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="text-3xl font-bold text-green-500">{foundItems.length}</div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Found Items</div>
              </div>
              <div className={`rounded-2xl p-4 border shadow-sm text-center transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="text-3xl font-bold text-blue-500">{lostItems.length}</div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Lost Cases</div>
              </div>
              <div className={`rounded-2xl p-4 border shadow-sm text-center transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{reuniteCount}</div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Reunited</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'found' && (
          <div className="space-y-6">
            <div className={`rounded-3xl shadow-md p-6 border transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center gap-3 mb-6">
                <div className={`rounded-full p-3 ${darkMode ? 'bg-green-900' : 'bg-green-100'}`}>
                  <svg className={`w-6 h-6 ${darkMode ? 'text-green-400' : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Report Found Item</h2>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Help reunite lost items with their owners</p>
                </div>
              </div>

              {/* Success Message */}
              {submitSuccess === 'found' && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3">
                  <div className="bg-green-500 rounded-full p-2">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-green-800 font-medium">Found report submitted successfully!</p>
                    <p className="text-green-600 text-sm">Redirecting to My Posts...</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleFoundSubmit} className="space-y-4">
                <div>
                  <label className={`block font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>What did you find? *</label>
                  <input
                    type="text"
                    value={foundForm.title}
                    onChange={(e) => setFoundForm(prev => ({ ...prev, title: e.target.value }))}
                    className={`w-full px-4 py-3 border rounded-2xl focus:ring-2 focus:ring-green-500 outline-none transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                    placeholder="e.g., Found iPhone, Lost Dog, Keys"
                  />
                </div>
                <div>
                  <label className={`block font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Description *</label>
                  <textarea
                    value={foundForm.description}
                    onChange={(e) => setFoundForm(prev => ({ ...prev, description: e.target.value }))}
                    className={`w-full px-4 py-3 border rounded-2xl focus:ring-2 focus:ring-green-500 outline-none transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                    rows="3"
                    placeholder="Describe the item - color, brand, condition..."
                  ></textarea>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Category *</label>
                    <select
                      value={foundForm.category}
                      onChange={(e) => setFoundForm(prev => ({ ...prev, category: e.target.value }))}
                      className={`w-full px-4 py-3 border rounded-2xl focus:ring-2 focus:ring-green-500 outline-none transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                      <option value="">Select category</option>
                      <option value="Electronics">Electronics</option>
                      <option value="Pets">Pets</option>
                      <option value="Personal Items">Personal Items</option>
                      <option value="Documents">Documents</option>
                      <option value="Keys">Keys</option>
                      <option value="Bags">Bags</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <LocationPickerSection accentColor="green" />

                {/* Date and Time Found */}
                <div>
                  <label className={`block font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Date & Time Found *</label>
                  <input
                    type="datetime-local"
                    value={foundForm.foundDateTime}
                    onChange={(e) => setFoundForm(prev => ({ ...prev, foundDateTime: e.target.value }))}
                    max={new Date().toISOString().slice(0, 16)}
                    className={`w-full px-4 py-3 border rounded-2xl focus:ring-2 focus:ring-green-500 outline-none transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  />
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>When did you find this item?</p>
                </div>

                <PhotoUploadSection accentColor="green" />

                {uploadError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                    {uploadError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white rounded-full px-6 py-3 font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Found Report'
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'finding' && (
          <div className="space-y-6">
            <div className={`rounded-3xl shadow-md p-6 border transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center gap-3 mb-6">
                <div className={`rounded-full p-3 ${darkMode ? 'bg-blue-900' : 'bg-blue-100'}`}>
                  <svg className={`w-6 h-6 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Post Lost Item</h2>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Set a bounty to find your lost item</p>
                </div>
              </div>

              {/* Success Message */}
              {submitSuccess === 'finding' && (
                <div className={`mb-6 p-4 rounded-2xl flex items-center gap-3 ${darkMode ? 'bg-blue-900/50 border border-blue-700' : 'bg-blue-50 border border-blue-200'}`}>
                  <div className="bg-blue-500 rounded-full p-2">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className={`font-medium ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>Lost item case posted successfully!</p>
                    <p className={`text-sm ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>Redirecting to My Posts...</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleFindingSubmit} className="space-y-4">
                <div>
                  <label className={`block font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>What are you looking for? *</label>
                  <input
                    type="text"
                    value={findingForm.title}
                    onChange={(e) => setFindingForm(prev => ({ ...prev, title: e.target.value }))}
                    className={`w-full px-4 py-3 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                    placeholder="e.g., Lost iPhone 13 Pro"
                  />
                </div>
                <div>
                  <label className={`block font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Description *</label>
                  <textarea
                    value={findingForm.description}
                    onChange={(e) => setFindingForm(prev => ({ ...prev, description: e.target.value }))}
                    className={`w-full px-4 py-3 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                    rows="3"
                    placeholder="Describe your item in detail..."
                  ></textarea>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Category *</label>
                    <select
                      value={findingForm.category}
                      onChange={(e) => setFindingForm(prev => ({ ...prev, category: e.target.value }))}
                      className={`w-full px-4 py-3 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                      <option value="">Select category</option>
                      <option value="Electronics">Electronics</option>
                      <option value="Pets">Pets</option>
                      <option value="Personal Items">Personal Items</option>
                      <option value="Documents">Documents</option>
                      <option value="Keys">Keys</option>
                      <option value="Bags">Bags</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <LocationPickerSection accentColor="blue" />

                {/* Finder's Fee Section */}
                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-blue-900/30 border-blue-700' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <svg className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <label className={`font-semibold ${darkMode ? 'text-blue-300' : 'text-gray-800'}`}>Finder's Fee (Optional)</label>
                  </div>
                  <p className={`text-sm mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Offer a reward to motivate finders. This is optional but increases your chances of recovery.
                  </p>
                  <div className="relative">
                    <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>$</span>
                    <input
                      type="number"
                      value={findingForm.bounty}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || parseFloat(value) <= 50) {
                          setFindingForm(prev => ({ ...prev, bounty: value }));
                        }
                      }}
                      className={`w-full pl-8 pr-16 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-blue-300'}`}
                      placeholder="0.00"
                      min="0"
                      max="50"
                      step="0.01"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">CAD</span>
                  </div>

                  {findingForm.bounty && parseFloat(findingForm.bounty) > 0 && (
                    <div className={`mt-3 p-3 rounded-xl border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-blue-100'}`}>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Finder's Fee:</span>
                          <span className={`font-medium ${darkMode ? 'text-gray-200' : ''}`}>${parseFloat(findingForm.bounty).toFixed(2)} CAD</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Platform Fee (2.5%):</span>
                          <span className="text-orange-500">-${(parseFloat(findingForm.bounty) * 0.025).toFixed(2)} CAD</span>
                        </div>
                        <div className={`flex justify-between pt-2 border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                          <span className={`font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Finder Receives:</span>
                          <span className="font-bold text-green-500">${(parseFloat(findingForm.bounty) * 0.975).toFixed(2)} CAD</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Maximum: $50 CAD. A 2.5% platform fee will be deducted from the finder's reward.
                  </p>
                </div>

                <PhotoUploadSection accentColor="blue" />

                {uploadError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                    {uploadError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full px-6 py-3 font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                      Posting...
                    </>
                  ) : (
                    `Post Case with $${findingForm.bounty || '0'} Bounty`
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'matches' && (
          <div className="space-y-6">
            {/* Matches Header with Stats */}
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-3xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Potential Matches</h2>
                  <p className="text-purple-100">Items that might match your lost/found cases</p>
                </div>
                <button
                  onClick={fetchMatches}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-full text-sm transition-colors"
                >
                  Refresh
                </button>
              </div>
              {matchStats && (
                <div className="mt-4 grid grid-cols-4 gap-4">
                  <div className="bg-white/10 rounded-2xl p-3 text-center">
                    <div className="text-2xl font-bold">{matchStats.total_matches || 0}</div>
                    <div className="text-xs text-purple-100">Total</div>
                  </div>
                  <div className="bg-white/10 rounded-2xl p-3 text-center">
                    <div className="text-2xl font-bold">{matchStats.pending_matches || 0}</div>
                    <div className="text-xs text-purple-100">Pending</div>
                  </div>
                  <div className="bg-white/10 rounded-2xl p-3 text-center">
                    <div className="text-2xl font-bold">{matchStats.high_confidence_matches || 0}</div>
                    <div className="text-xs text-purple-100">High Similarity</div>
                  </div>
                  <div className="bg-white/10 rounded-2xl p-3 text-center">
                    <div className="text-2xl font-bold">{matchStats.confirmed_matches || 0}</div>
                    <div className="text-xs text-purple-100">Confirmed</div>
                  </div>
                </div>
              )}
            </div>

            {/* Matches List */}
            {isLoadingMatches ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
              </div>
            ) : matches.length === 0 ? (
              <div className={`rounded-3xl shadow-md p-12 text-center border transition-colors ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <svg className={`w-8 h-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-700'}`}>No Matches Yet</h3>
                <p className={`mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>When someone finds or loses an item similar to yours, it will appear here.</p>
                <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Post more items with clear photos to increase your chances of finding a match!</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {matches.map((match) => (
                  <div
                    key={match.id}
                    className={`rounded-3xl shadow-md border overflow-hidden hover:shadow-lg transition-shadow cursor-pointer ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                    onClick={() => setSelectedMatch(match)}
                  >
                    <div className="flex">
                      {/* Your Item */}
                      <div className={`flex-1 p-4 border-r ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                        <div className={`text-xs mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>YOUR ITEM</div>
                        <div className="flex gap-3">
                          <img
                            src={getImageUrl(match.own_photo?.image_url) || 'https://via.placeholder.com/80'}
                            alt="Your item"
                            className="w-16 h-16 rounded-xl object-cover"
                          />
                          <div>
                            <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-800'}`}>{match.own_case?.title}</h4>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              match.own_case?.case_type === 'lost_item'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {match.own_case?.case_type === 'lost_item' ? 'Lost' : 'Found'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Match Score */}
                      <div className="px-4 py-4 flex flex-col items-center justify-center bg-gray-50">
                        <div className={`text-2xl font-bold ${
                          match.overall_score >= 85 ? 'text-green-600' :
                          match.overall_score >= 70 ? 'text-yellow-600' : 'text-gray-600'
                        }`}>
                          {match.overall_score}%
                        </div>
                        <div className="text-xs text-gray-500">Similarity</div>
                        {match.match_type && (
                          <div className="mt-1 text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                            {match.match_type === 'license_plate' ? 'License Plate' :
                             match.match_type === 'serial_number' ? 'Serial Number' :
                             match.match_type.charAt(0).toUpperCase() + match.match_type.slice(1)}
                          </div>
                        )}
                      </div>

                      {/* Matched Item */}
                      <div className="flex-1 p-4 border-l border-gray-100">
                        <div className="text-xs text-gray-400 mb-2">POTENTIAL MATCH</div>
                        <div className="flex gap-3">
                          <img
                            src={getImageUrl(match.matched_photo?.image_url) || 'https://via.placeholder.com/80'}
                            alt="Matched item"
                            className="w-16 h-16 rounded-xl object-cover"
                          />
                          <div>
                            <h4 className="font-medium text-gray-800">{match.matched_case?.title}</h4>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              match.matched_case?.case_type === 'lost_item'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {match.matched_case?.case_type === 'lost_item' ? 'Lost' : 'Found'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Matched Identifiers & Visual Details */}
                    {match.matched_identifiers && (
                      match.matched_identifiers.licensePlates?.length > 0 ||
                      match.matched_identifiers.serialNumbers?.length > 0 ||
                      match.matched_identifiers.colors?.length > 0 ||
                      match.matched_identifiers.shapeMatch
                    ) && (
                      <div className="px-4 py-2 bg-gradient-to-r from-purple-50 to-blue-50 border-t border-purple-100 flex flex-wrap items-center gap-2">
                        {/* License Plates */}
                        {match.matched_identifiers.licensePlates?.map((p, i) => (
                          <span key={`lp-${i}`} className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                            <span className="font-mono">{p.source}</span>
                          </span>
                        ))}
                        {/* Serial Numbers */}
                        {match.matched_identifiers.serialNumbers?.map((s, i) => (
                          <span key={`sn-${i}`} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                            <span className="font-mono">{s.source}</span>
                          </span>
                        ))}
                        {/* Matching Colors */}
                        {match.matched_identifiers.colors?.map((color, i) => (
                          <span
                            key={`color-${i}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs capitalize"
                            style={{
                              backgroundColor: getColorValue(color),
                              color: ['white', 'yellow', 'beige', 'silver', 'gold'].includes(color) ? '#374151' : '#ffffff'
                            }}
                          >
                            {color}
                          </span>
                        ))}
                        {/* Shape Match */}
                        {match.matched_identifiers.shapeMatch && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
                            </svg>
                            Shape match
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Match Detail Modal */}
            {selectedMatch && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedMatch(null)}>
                <div className={`rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-gray-800' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
                  <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-6 py-4 rounded-t-3xl flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold">Match Details</h3>
                      <p className="text-purple-100 text-sm">{selectedMatch.overall_score}% similarity</p>
                    </div>
                    <button
                      onClick={() => setSelectedMatch(null)}
                      className="p-2 hover:bg-white/20 rounded-full transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Side by Side Comparison */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className={`rounded-2xl p-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                        <div className={`text-sm font-medium mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>YOUR ITEM</div>
                        <img
                          src={getImageUrl(selectedMatch.own_photo?.image_url) || 'https://via.placeholder.com/300'}
                          alt="Your item"
                          className="w-full h-48 rounded-xl object-cover mb-3"
                        />
                        <h4 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{selectedMatch.own_case?.title}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          selectedMatch.own_case?.case_type === 'lost_item'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {selectedMatch.own_case?.case_type === 'lost_item' ? 'Lost Item' : 'Found Item'}
                        </span>
                      </div>

                      <div className={`rounded-2xl p-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                        <div className={`text-sm font-medium mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>POTENTIAL MATCH</div>
                        <img
                          src={getImageUrl(selectedMatch.matched_photo?.image_url) || 'https://via.placeholder.com/300'}
                          alt="Matched item"
                          className="w-full h-48 rounded-xl object-cover mb-3"
                        />
                        <h4 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{selectedMatch.matched_case?.title}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          selectedMatch.matched_case?.case_type === 'lost_item'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {selectedMatch.matched_case?.case_type === 'lost_item' ? 'Lost Item' : 'Found Item'}
                        </span>
                      </div>
                    </div>

                    {/* Match Score Breakdown */}
                    <div className={`rounded-2xl p-4 ${darkMode ? 'bg-gray-700' : 'bg-purple-50'}`}>
                      <h4 className={`font-medium mb-3 ${darkMode ? 'text-purple-300' : 'text-purple-800'}`}>Match Score Breakdown</h4>

                      {/* Overall Score Bar */}
                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-1">
                          <span className={`font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Overall Similarity</span>
                          <span className={`font-bold ${
                            selectedMatch.overall_score >= 75 ? 'text-green-600' :
                            selectedMatch.overall_score >= 55 ? 'text-yellow-600' : 'text-red-600'
                          }`}>{selectedMatch.overall_score}%</span>
                        </div>
                        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              selectedMatch.overall_score >= 75 ? 'bg-gradient-to-r from-green-400 to-green-500' :
                              selectedMatch.overall_score >= 55 ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' :
                              'bg-gradient-to-r from-red-400 to-red-500'
                            }`}
                            style={{ width: `${selectedMatch.overall_score}%` }}
                          />
                        </div>
                      </div>

                      {/* Match Type Badge */}
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-sm text-gray-600">Match Type:</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          selectedMatch.match_type === 'license_plate' || selectedMatch.match_type === 'serial_number'
                            ? 'bg-green-100 text-green-700'
                            : selectedMatch.match_type === 'color' || selectedMatch.match_type === 'shape'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {selectedMatch.match_type?.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>

                      {/* Individual Scores */}
                      <div className="space-y-2">
                        {/* Color Score */}
                        {selectedMatch.color_score > 0 && (
                          <div className="flex items-center gap-3">
                            <div className="w-20 text-xs text-gray-500">Color</div>
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-pink-400 to-pink-500 rounded-full"
                                style={{ width: `${selectedMatch.color_score}%` }}
                              />
                            </div>
                            <div className="w-10 text-xs font-medium text-gray-700">{selectedMatch.color_score}%</div>
                          </div>
                        )}

                        {/* Shape Score */}
                        {selectedMatch.shape_score > 0 && (
                          <div className="flex items-center gap-3">
                            <div className="w-20 text-xs text-gray-500">Shape</div>
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full"
                                style={{ width: `${selectedMatch.shape_score}%` }}
                              />
                            </div>
                            <div className="w-10 text-xs font-medium text-gray-700">{selectedMatch.shape_score}%</div>
                          </div>
                        )}

                        {/* Visual Score */}
                        {selectedMatch.visual_score > 0 && (
                          <div className="flex items-center gap-3">
                            <div className="w-20 text-xs text-gray-500">Visual</div>
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-indigo-400 to-indigo-500 rounded-full"
                                style={{ width: `${selectedMatch.visual_score}%` }}
                              />
                            </div>
                            <div className="w-10 text-xs font-medium text-gray-700">{selectedMatch.visual_score}%</div>
                          </div>
                        )}

                        {/* Hash Score */}
                        {selectedMatch.hash_score > 0 && (
                          <div className="flex items-center gap-3">
                            <div className="w-20 text-xs text-gray-500">Similarity</div>
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-teal-400 to-teal-500 rounded-full"
                                style={{ width: `${selectedMatch.hash_score}%` }}
                              />
                            </div>
                            <div className="w-10 text-xs font-medium text-gray-700">{selectedMatch.hash_score}%</div>
                          </div>
                        )}

                        {/* OCR Score */}
                        {selectedMatch.ocr_score > 0 && (
                          <div className="flex items-center gap-3">
                            <div className="w-20 text-xs text-gray-500">Text/ID</div>
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full"
                                style={{ width: `${selectedMatch.ocr_score}%` }}
                              />
                            </div>
                            <div className="w-10 text-xs font-medium text-gray-700">{selectedMatch.ocr_score}%</div>
                          </div>
                        )}
                      </div>

                      {/* Matched Details */}
                      {selectedMatch.matched_identifiers && (
                        <div className="mt-4 pt-4 border-t border-purple-200">
                          {/* Matching Colors */}
                          {selectedMatch.matched_identifiers?.colors?.length > 0 && (
                            <div className="mb-3">
                              <span className="text-xs text-gray-500 block mb-2">Matching Colors:</span>
                              <div className="flex gap-2 flex-wrap">
                                {selectedMatch.matched_identifiers.colors.map((color, idx) => (
                                  <span
                                    key={idx}
                                    className="px-3 py-1 rounded-full text-xs font-medium capitalize"
                                    style={{
                                      backgroundColor: getColorValue(color),
                                      color: ['white', 'yellow', 'beige', 'silver', 'gold'].includes(color) ? '#374151' : '#ffffff'
                                    }}
                                  >
                                    {color}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* License Plate Match */}
                          {selectedMatch.matched_identifiers?.licensePlates?.length > 0 && (
                            <div className="mb-3">
                              <span className={`text-xs block mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>🚗 License Plate Match:</span>
                              <div className={`rounded-lg p-2 border ${darkMode ? 'bg-gray-600 border-green-600' : 'bg-white border-green-200'}`}>
                                <span className={`font-mono font-bold ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
                                  {selectedMatch.matched_identifiers.licensePlates[0].source}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Serial Number Match */}
                          {selectedMatch.matched_identifiers?.serialNumbers?.length > 0 && (
                            <div className="mb-3">
                              <span className={`text-xs block mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>🔢 Serial Number Match:</span>
                              <div className={`rounded-lg p-2 border ${darkMode ? 'bg-gray-600 border-green-600' : 'bg-white border-green-200'}`}>
                                <span className={`font-mono font-bold ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
                                  {selectedMatch.matched_identifiers.serialNumbers[0].source}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Shape Match */}
                          {selectedMatch.matched_identifiers?.shapeMatch && (
                            <div className="flex items-center gap-2 text-xs text-blue-600">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
                              </svg>
                              <span>Similar shape detected ({selectedMatch.matched_identifiers.shapeMatch.similarity}% match)</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Match Reasons - Visual-First Explanations */}
                      {selectedMatch.match_details?.matchReasons?.length > 0 && (
                        <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-gray-600' : 'border-purple-200'}`}>
                          <span className={`text-xs block mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Why This Matched:</span>
                          <div className="space-y-2">
                            {selectedMatch.match_details.matchReasons.map((reason, idx) => (
                              <div key={idx} className={`flex items-start gap-3 rounded-xl p-3 border shadow-sm ${darkMode ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-100'}`}>
                                <span className="text-lg">{typeof reason === 'object' ? reason.icon : '✓'}</span>
                                <div className="flex-1">
                                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{typeof reason === 'object' ? reason.text : reason}</p>
                                  {reason.colors && reason.colors.length > 0 && (
                                    <div className="flex gap-1 mt-1 flex-wrap">
                                      {reason.colors.slice(0, 5).map((color, cidx) => (
                                        <span
                                          key={cidx}
                                          className="w-5 h-5 rounded-full border border-gray-200"
                                          style={{ backgroundColor: getColorValue(color) }}
                                          title={color}
                                        />
                                      ))}
                                    </div>
                                  )}
                                  {reason.petFeatures && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      Coat: {reason.petFeatures.coatType} •
                                      Colors: {reason.petFeatures.primaryColor}
                                      {reason.petFeatures.secondaryColor ? ` + ${reason.petFeatures.secondaryColor}` : ''}
                                    </p>
                                  )}
                                </div>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                  reason.score >= 70 ? 'bg-green-100 text-green-700' :
                                  reason.score >= 50 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {reason.score}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Auto-detected Category */}
                      {selectedMatch.match_details?.autoDetectedCategory && (
                        <div className="mt-3 flex items-center gap-2 text-xs">
                          <span className="text-gray-500">Auto-detected:</span>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                            {selectedMatch.match_details.autoDetectedCategory.category}
                          </span>
                          <span className="text-gray-400">
                            ({selectedMatch.match_details.autoDetectedCategory.confidence}% confidence)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-3">
                      {/* Feedback buttons - only show if not already confirmed/rejected */}
                      {selectedMatch.status !== 'confirmed' && selectedMatch.status !== 'rejected' && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleMatchFeedback(selectedMatch.id, 'confirmed')}
                            disabled={isSubmittingFeedback}
                            className={`flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-full font-medium transition-all ${
                              isSubmittingFeedback ? 'opacity-50 cursor-not-allowed' : 'hover:from-green-600 hover:to-green-700 shadow-lg hover:shadow-xl'
                            }`}
                          >
                            {isSubmittingFeedback ? 'Submitting...' : 'Confirm Match'}
                          </button>
                          <button
                            onClick={() => setRejectionModal({ matchId: selectedMatch.id, matchScore: selectedMatch.overall_score })}
                            disabled={isSubmittingFeedback}
                            className={`flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full font-medium transition-all ${
                              isSubmittingFeedback ? 'opacity-50 cursor-not-allowed' : 'hover:from-red-600 hover:to-red-700 shadow-lg hover:shadow-xl'
                            }`}
                          >
                            Not a Match
                          </button>
                        </div>
                      )}
                      {/* Status indicator if already reviewed */}
                      {(selectedMatch.status === 'confirmed' || selectedMatch.status === 'rejected') && (
                        <div className={`text-center py-3 rounded-full font-medium ${
                          selectedMatch.status === 'confirmed'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {selectedMatch.status === 'confirmed' ? 'You confirmed this match' : 'You marked this as not a match'}
                        </div>
                      )}
                      {/* View and Close buttons */}
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            // Navigate to the potential match case
                            window.open(`/case/${selectedMatch.matched_case?.id}`, '_blank');
                          }}
                          className="flex-1 px-4 py-3 bg-purple-500 text-white rounded-full font-medium hover:bg-purple-600 transition-colors"
                        >
                          View Potential Match
                        </button>
                        <button
                          onClick={() => setSelectedMatch(null)}
                          className="px-4 py-3 border border-gray-300 text-gray-700 rounded-full font-medium hover:bg-gray-50 transition-colors"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Claims Tab */}
        {activeTab === 'claims' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-3xl shadow-lg p-6 text-white">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Claims</h2>
                  <p className="text-orange-100 text-sm">Review claims on your found items & track your submitted claims</p>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={`rounded-2xl p-4 border shadow-sm ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-orange-100'}`}>
                <div className="text-3xl font-bold text-orange-600">{claimsStats?.receivedClaims?.byStatus?.pending || 0}</div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Pending Review</div>
              </div>
              <div className={`rounded-2xl p-4 border shadow-sm ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-orange-100'}`}>
                <div className="text-3xl font-bold text-green-600">{claimsStats?.receivedClaims?.byStatus?.accepted || 0}</div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Accepted</div>
              </div>
              <div className={`rounded-2xl p-4 border shadow-sm ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-orange-100'}`}>
                <div className="text-3xl font-bold text-blue-600">{claimsStats?.myClaims?.total || 0}</div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>My Claims</div>
              </div>
              <div className={`rounded-2xl p-4 border shadow-sm ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-orange-100'}`}>
                <div className={`text-3xl font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{claimsStats?.receivedClaims?.byStatus?.completed || 0}</div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Completed</div>
              </div>
            </div>

            {/* Received Claims Section (for finders) */}
            <div className={`rounded-3xl shadow-md p-6 border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-orange-100'}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`rounded-full p-2 ${darkMode ? 'bg-orange-900' : 'bg-orange-100'}`}>
                  <svg className={`w-5 h-5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5-5-5 5h5zm0 0v-8a1 1 0 00-1-1h-4a1 1 0 00-1 1v8" />
                  </svg>
                </div>
                <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Claims on My Found Items</h2>
              </div>

              {isLoadingClaims ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <p className="text-gray-500">Loading claims...</p>
                </div>
              ) : receivedClaims.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No claims received yet</p>
                  <p className="text-sm">When someone claims your found item, it will appear here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {receivedClaims.map((claim) => (
                    <div
                      key={claim.id}
                      className={`border rounded-2xl p-4 ${
                        claim.status === 'pending' ? 'border-orange-300 bg-orange-50/50' :
                        claim.status === 'accepted' ? 'border-green-300 bg-green-50/50' :
                        claim.status === 'rejected' ? 'border-red-200 bg-red-50/50' :
                        'border-gray-200 bg-gray-50/50'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-white font-bold">
                          {claim.claimant?.full_name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div>
                              <h3 className="font-semibold text-gray-900">{claim.claimant?.full_name || 'Unknown User'}</h3>
                              {claim.foundCase?.case_number && (
                                <span className="text-xs font-mono text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
                                  Case #{claim.foundCase.case_number}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                claim.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                                claim.status === 'under_review' ? 'bg-blue-100 text-blue-700' :
                                claim.status === 'accepted' ? 'bg-green-100 text-green-700' :
                                claim.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                claim.status === 'completed' ? 'bg-gray-100 text-gray-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {claim.status.charAt(0).toUpperCase() + claim.status.slice(1).replace('_', ' ')}
                              </span>
                              {claim.foundCase?.status && claim.foundCase.status !== 'active' && (
                                <span className={`px-2 py-0.5 rounded-full text-xs ${
                                  claim.foundCase.status === 'claimed' ? 'bg-blue-100 text-blue-700' :
                                  claim.foundCase.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                                  claim.foundCase.status === 'completed' ? 'bg-purple-100 text-purple-700' :
                                  claim.foundCase.status === 'archived' ? 'bg-gray-100 text-gray-600' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  Case: {claim.foundCase.status.charAt(0).toUpperCase() + claim.foundCase.status.slice(1).replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          </div>

                          <p className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Verification:</span> {claim.verification_description}
                          </p>

                          {claim.bounty_offered > 0 && (
                            <div className="flex items-center gap-1 text-sm text-green-600 mb-2">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="font-medium">${parseFloat(claim.bounty_offered).toFixed(2)} CAD reward offered</span>
                            </div>
                          )}

                          <p className="text-xs text-gray-400">
                            Claimed {new Date(claim.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </p>

                          {/* Action Buttons */}
                          {claim.status === 'pending' && (
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={() => handleAcceptClaim(claim.id)}
                                className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-full text-sm font-medium hover:shadow-lg transition-all flex items-center justify-center gap-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Accept
                              </button>
                              <button
                                onClick={() => {
                                  const reason = prompt('Reason for rejection (optional):');
                                  handleRejectClaim(claim.id, reason || 'Verification failed');
                                }}
                                className="flex-1 px-4 py-2 border border-red-300 text-red-600 rounded-full text-sm font-medium hover:bg-red-50 transition-all flex items-center justify-center gap-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Reject
                              </button>
                            </div>
                          )}

                          {claim.status === 'accepted' && (
                            <div className="mt-3 p-3 bg-green-100 rounded-xl text-sm text-green-700">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Claim accepted! Arrange handover with the owner.
                                </div>
                                <button
                                  onClick={() => openChat(claim, claim.claimant, claim.foundCase?.title || 'Item')}
                                  className="px-3 py-1.5 bg-green-600 text-white rounded-full text-xs font-medium hover:bg-green-700 transition-colors flex items-center gap-1"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                  </svg>
                                  Chat
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* My Submitted Claims Section */}
            <div className={`rounded-3xl shadow-md p-6 border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-orange-100'}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`rounded-full p-2 ${darkMode ? 'bg-blue-900' : 'bg-blue-100'}`}>
                  <svg className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>My Submitted Claims</h2>
              </div>

              {myClaims.length === 0 ? (
                <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <svg className={`w-12 h-12 mx-auto mb-2 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No claims submitted yet</p>
                  <p className="text-sm">When you claim a found item, it will appear here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myClaims.map((claim) => (
                    <div
                      key={claim.id}
                      className={`border rounded-2xl p-4 transition-colors ${darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-200 hover:border-orange-200'}`}
                    >
                      <div className="flex items-start gap-4">
                        <img
                          src={getImageUrl(claim.foundCase?.photos?.[0]?.image_url) || 'https://via.placeholder.com/80'}
                          alt={claim.foundCase?.title}
                          className="w-16 h-16 rounded-xl object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div>
                              <h3 className={`font-semibold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{claim.foundCase?.title || 'Unknown Item'}</h3>
                              {claim.foundCase?.case_number && (
                                <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                  Case #{claim.foundCase.case_number}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                claim.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                claim.status === 'accepted' ? 'bg-green-100 text-green-700' :
                                claim.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                claim.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {claim.status.charAt(0).toUpperCase() + claim.status.slice(1).replace('_', ' ')}
                              </span>
                              {claim.foundCase?.status && claim.foundCase.status !== 'active' && (
                                <span className={`px-2 py-0.5 rounded-full text-xs ${
                                  claim.foundCase.status === 'claimed' ? 'bg-blue-100 text-blue-700' :
                                  claim.foundCase.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                                  claim.foundCase.status === 'completed' ? 'bg-purple-100 text-purple-700' :
                                  claim.foundCase.status === 'archived' ? 'bg-gray-100 text-gray-600' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  Case: {claim.foundCase.status.charAt(0).toUpperCase() + claim.foundCase.status.slice(1).replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">
                            Found by: {claim.foundCase?.poster?.full_name || 'Unknown'}
                          </p>
                          {claim.bounty_offered > 0 && (
                            <p className="text-sm text-green-600">
                              Reward offered: ${parseFloat(claim.bounty_offered).toFixed(2)} CAD
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            Submitted {new Date(claim.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>

                          {claim.status === 'rejected' && claim.rejection_reason && (
                            <div className="mt-2 p-2 bg-red-50 rounded-lg text-sm text-red-600">
                              <span className="font-medium">Reason:</span> {claim.rejection_reason}
                            </div>
                          )}

                          {claim.status === 'accepted' && (
                            <div className="mt-2 p-2 bg-green-50 rounded-lg text-sm text-green-600">
                              <div className="flex items-center justify-between">
                                <span>Your claim was accepted! Contact the finder to arrange handover.</span>
                                <button
                                  onClick={() => openChat(claim, claim.foundCase?.poster, claim.foundCase?.title || 'Item')}
                                  className="px-3 py-1 bg-green-600 text-white rounded-full text-xs font-medium hover:bg-green-700 transition-colors flex items-center gap-1 ml-2"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                  </svg>
                                  Chat
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'my-posts' && (
          <div className="space-y-6">
            {/* My Found Reports */}
            <div className={`rounded-3xl shadow-md p-6 border transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-full p-2 ${darkMode ? 'bg-green-900' : 'bg-green-100'}`}>
                    <svg className={`w-5 h-5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>My Found Reports</h2>
                </div>
                <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{foundItems.filter(i => i.isOwn).length} items</span>
              </div>
              {foundItems.filter(i => i.isOwn).length > 0 ? (
                <div className="space-y-3">
                  {foundItems.filter(i => i.isOwn).map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${darkMode ? 'bg-green-900/30 border-green-800 hover:border-green-600' : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-100 hover:shadow-md hover:border-green-300'}`}
                    >
                      <div
                        className="flex items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => {
                          setSelectedItem({ ...item, type: 'found' });
                          setEditForm({ title: item.title, description: item.description, category: item.category });
                        }}
                      >
                        <img src={item.image} alt={item.title} className="w-14 h-14 rounded-xl object-cover shadow-sm" />
                        <div>
                          <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-800'}`}>{item.title}</h3>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.category} • {item.location}</p>
                          <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Posted {item.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            item.status === 'active' ? 'bg-green-500 text-white' :
                            item.status === 'claimed' ? 'bg-blue-500 text-white' :
                            item.status === 'in_progress' ? 'bg-yellow-500 text-white' :
                            item.status === 'completed' ? 'bg-purple-500 text-white' :
                            item.status === 'archived' ? 'bg-gray-400 text-white' :
                            'bg-gray-200 text-gray-600'
                          }`}>
                            {item.status === 'active' ? 'Active' :
                             item.status === 'claimed' ? 'Claimed' :
                             item.status === 'in_progress' ? 'In Progress' :
                             item.status === 'completed' ? 'Completed' :
                             item.status === 'archived' ? 'Archived' : item.status}
                          </span>
                          {item.photos && item.photos.length > 1 && (
                            <span className="text-xs text-gray-400">{item.photos.length} photos</span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ id: item.id, title: item.title, type: 'found', item });
                          }}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                          title="Delete"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <svg
                          className="w-5 h-5 text-gray-400 cursor-pointer"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          onClick={() => {
                            setSelectedItem({ ...item, type: 'found' });
                            setEditForm({ title: item.title, description: item.description, category: item.category });
                          }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <svg className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>No found reports yet</p>
                  <button
                    onClick={() => setActiveTab('found')}
                    className={`mt-3 px-4 py-2 rounded-full text-sm font-medium transition-colors ${darkMode ? 'text-green-400 hover:bg-green-900/50' : 'text-green-600 hover:bg-green-50'}`}
                  >
                    + Report a Found Item
                  </button>
                </div>
              )}
            </div>

            {/* My Lost Item Cases */}
            <div className={`rounded-3xl shadow-md p-6 border transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-full p-2 ${darkMode ? 'bg-blue-900' : 'bg-blue-100'}`}>
                    <svg className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>My Lost Item Cases</h2>
                </div>
                <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{lostItems.filter(i => i.isOwn).length} cases</span>
              </div>
              {lostItems.filter(i => i.isOwn).length > 0 ? (
                <div className="space-y-3">
                  {lostItems.filter(i => i.isOwn).map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${darkMode ? 'bg-blue-900/30 border-blue-800 hover:border-blue-600' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100 hover:shadow-md hover:border-blue-300'}`}
                    >
                      <div
                        className="flex items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => {
                          setSelectedItem({ ...item, type: 'lost' });
                          setEditForm({ title: item.title, description: item.description, category: item.category, bounty: item.bounty });
                        }}
                      >
                        {item.image ? (
                          <img src={item.image} alt={item.title} className="w-14 h-14 rounded-xl object-cover shadow-sm" />
                        ) : (
                          <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${darkMode ? 'bg-blue-900' : 'bg-blue-100'}`}>
                            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </div>
                        )}
                        <div>
                          <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-800'}`}>{item.title}</h3>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.category} • {item.location}</p>
                          <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Posted {item.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-2">
                          {item.bounty > 0 && (
                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-bold">
                              ${item.bounty}
                            </span>
                          )}
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            item.status === 'active' ? 'bg-blue-500 text-white' :
                            item.status === 'claimed' ? 'bg-yellow-500 text-white' :
                            item.status === 'in_progress' ? 'bg-orange-500 text-white' :
                            item.status === 'completed' ? 'bg-purple-500 text-white' :
                            item.status === 'archived' ? 'bg-gray-400 text-white' :
                            'bg-green-500 text-white'
                          }`}>
                            {item.status === 'active' ? 'Searching' :
                             item.status === 'claimed' ? 'Potential Match' :
                             item.status === 'in_progress' ? 'In Progress' :
                             item.status === 'completed' ? 'Completed' :
                             item.status === 'archived' ? 'Archived' : 'Found!'}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ id: item.id, title: item.title, type: 'lost', item });
                          }}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                          title="Delete"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <svg
                          className="w-5 h-5 text-gray-400 cursor-pointer"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          onClick={() => {
                            setSelectedItem({ ...item, type: 'lost' });
                            setEditForm({ title: item.title, description: item.description, category: item.category, bounty: item.bounty });
                          }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-gray-500">No lost item cases yet</p>
                  <button
                    onClick={() => setActiveTab('finding')}
                    className="mt-3 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-full text-sm font-medium transition-colors"
                  >
                    + Post a Lost Item Case
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Item Detail Modal */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className={`rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              {/* Header */}
              <div className={`p-6 rounded-t-3xl ${selectedItem.type === 'found' ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-blue-500 to-indigo-600'} text-white`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 rounded-full p-2">
                      {selectedItem.type === 'found' ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">{isEditing ? 'Edit Item' : 'Item Details'}</h2>
                      <p className="text-white/80 text-sm">{selectedItem.type === 'found' ? 'Found Report' : 'Lost Item Case'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setSelectedItem(null); setIsEditing(false); }}
                    className="bg-white/20 hover:bg-white/30 rounded-full p-2 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                {/* Image */}
                {selectedItem.image && (
                  <img src={selectedItem.image} alt={selectedItem.title} className="w-full h-48 object-cover rounded-2xl" />
                )}

                {isEditing ? (
                  /* Edit Form */
                  <div className="space-y-4">
                    <div>
                      <label className={`block font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Title</label>
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                        className={`w-full px-4 py-3 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300 text-gray-900'}`}
                      />
                    </div>
                    <div>
                      <label className={`block font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Description</label>
                      <textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                        className={`w-full px-4 py-3 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300 text-gray-900'}`}
                        rows="3"
                      />
                    </div>
                    <div>
                      <label className={`block font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Category</label>
                      <select
                        value={editForm.category}
                        onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                        className={`w-full px-4 py-3 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300 text-gray-900'}`}
                      >
                        <option value="Electronics">Electronics</option>
                        <option value="Pets">Pets</option>
                        <option value="Personal Items">Personal Items</option>
                        <option value="Documents">Documents</option>
                        <option value="Keys">Keys</option>
                        <option value="Bags">Bags</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    {selectedItem.type === 'lost' && (
                      <div>
                        <label className={`block font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Finder's Fee ($)</label>
                        <input
                          type="number"
                          value={editForm.bounty}
                          onChange={(e) => setEditForm(prev => ({ ...prev, bounty: e.target.value }))}
                          className={`w-full px-4 py-3 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300 text-gray-900'}`}
                          max="50"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  /* View Mode */
                  <div className="space-y-4">
                    <div>
                      <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{selectedItem.title}</h3>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          selectedItem.status === 'active' ? (selectedItem.type === 'found' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white') :
                          selectedItem.status === 'claimed' ? 'bg-yellow-500 text-white' :
                          selectedItem.status === 'in_progress' ? 'bg-orange-500 text-white' :
                          selectedItem.status === 'completed' ? 'bg-purple-500 text-white' :
                          selectedItem.status === 'archived' ? 'bg-gray-400 text-white' :
                          'bg-gray-200 text-gray-600'
                        }`}>
                          {selectedItem.status === 'active' ? (selectedItem.type === 'found' ? 'Active' : 'Searching') :
                           selectedItem.status === 'claimed' ? (selectedItem.type === 'found' ? 'Claimed' : 'Potential Match') :
                           selectedItem.status === 'in_progress' ? 'In Progress' :
                           selectedItem.status === 'completed' ? 'Completed' :
                           selectedItem.status === 'archived' ? 'Archived' : 'Resolved'}
                        </span>
                        {selectedItem.type === 'lost' && selectedItem.bounty > 0 && (
                          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-bold">
                            ${selectedItem.bounty} Reward
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={`rounded-2xl p-4 space-y-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                      <div className="flex items-start gap-3">
                        <svg className={`w-5 h-5 mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                        </svg>
                        <div>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Description</p>
                          <p className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{selectedItem.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <svg className={`w-5 h-5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        <div>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Category</p>
                          <p className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{selectedItem.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <div>
                          <p className="text-sm text-gray-500">Location</p>
                          <p className="text-gray-800">{selectedItem.location}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <div>
                          <p className="text-sm text-gray-500">Posted</p>
                          <p className="text-gray-800">{selectedItem.date}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-gray-100 flex gap-3">
                {isEditing ? (
                  <>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-full font-medium hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        const token = localStorage.getItem('adminToken');
                        try {
                          const response = await fetch(`${API_URL}/cases/${selectedItem.id}`, {
                            method: 'PUT',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${token}`,
                            },
                            body: JSON.stringify({
                              title: editForm.title,
                              description: editForm.description,
                              bounty_amount: editForm.bounty || 0,
                            }),
                          });
                          if (response.ok) {
                            // Update local state
                            if (selectedItem.type === 'found') {
                              setFoundItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, ...editForm } : i));
                            } else {
                              setLostItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, ...editForm } : i));
                            }
                            setSelectedItem({ ...selectedItem, ...editForm });
                            setIsEditing(false);
                          }
                        } catch (error) {
                          console.error('Failed to update:', error);
                        }
                      }}
                      className={`flex-1 px-4 py-3 text-white rounded-full font-medium transition-colors ${
                        selectedItem.type === 'found'
                          ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                          : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                      }`}
                    >
                      Save Changes
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-full font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                    <button
                      onClick={() => { setSelectedItem(null); setIsEditing(false); }}
                      className={`flex-1 px-4 py-3 text-white rounded-full font-medium transition-colors ${
                        selectedItem.type === 'found'
                          ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                          : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                      }`}
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`rounded-3xl shadow-xl w-full max-w-sm overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              {/* Header */}
              <div className="bg-gradient-to-r from-red-500 to-red-600 text-white p-6">
                <div className="flex items-center gap-4">
                  <div className="bg-white/20 rounded-full p-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Delete Item</h2>
                    <p className="text-white/80 text-sm">This action cannot be undone</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                  Are you sure you want to delete <span className="font-semibold">"{deleteConfirm.title}"</span>?
                </p>
                <p className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  This will permanently remove the {deleteConfirm.type === 'found' ? 'found report' : 'lost item case'} and all associated data.
                </p>
              </div>

              {/* Footer */}
              <div className={`p-6 border-t flex gap-3 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isDeleting}
                  className={`flex-1 px-4 py-3 border rounded-full font-medium transition-colors disabled:opacity-50 ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteItem(deleteConfirm.item, deleteConfirm.type)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-full font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rejection Feedback Modal */}
        <RejectionFeedbackModal
          isOpen={!!rejectionModal}
          onClose={() => setRejectionModal(null)}
          onSubmit={(data) => handleMatchFeedback(rejectionModal?.matchId, 'rejected', data)}
          matchScore={rejectionModal?.matchScore || 0}
          isSubmitting={isSubmittingFeedback}
          darkMode={darkMode}
        />

        {/* Claim Modal with Payment Flow */}
        {claimModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`rounded-3xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              {/* Header - Changes based on step */}
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6 flex-shrink-0">
                <div className="flex items-center gap-4">
                  <div className="bg-white/20 rounded-full p-3">
                    {paymentStep === 'success' ? (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : paymentStep === 'payment' || paymentStep === 'processing' ? (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">
                      {paymentStep === 'success' ? 'Claim Submitted!' :
                       paymentStep === 'payment' ? 'Payment' :
                       paymentStep === 'processing' ? 'Processing...' :
                       'Claim This Item'}
                    </h2>
                    <p className="text-white/80 text-sm">
                      {paymentStep === 'success' ? 'Your claim has been sent to the finder' :
                       paymentStep === 'payment' ? 'Complete payment to submit claim' :
                       paymentStep === 'processing' ? 'Please wait while we process' :
                       'Prove it\'s yours to get it back'}
                    </p>
                  </div>
                </div>

                {/* Step Indicator */}
                {paymentStep !== 'success' && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <div className={`w-3 h-3 rounded-full ${paymentStep === 'form' ? 'bg-white' : 'bg-white/40'}`} />
                    <div className={`w-8 h-0.5 ${paymentStep !== 'form' ? 'bg-white' : 'bg-white/40'}`} />
                    <div className={`w-3 h-3 rounded-full ${paymentStep === 'payment' || paymentStep === 'processing' ? 'bg-white' : 'bg-white/40'}`} />
                  </div>
                )}
              </div>

              {/* Item Preview - Always show except on success */}
              {paymentStep !== 'success' && (
                <div className={`p-4 border-b flex-shrink-0 ${darkMode ? 'bg-orange-900/30 border-orange-800' : 'bg-orange-50 border-orange-100'}`}>
                  <div className="flex items-center gap-4">
                    <img
                      src={claimModal.item?.image}
                      alt={claimModal.item?.title}
                      className="w-16 h-16 rounded-2xl object-cover shadow-md"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{claimModal.item?.title}</h3>
                      <p className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{claimModal.item?.location}</p>
                      <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Posted by {claimModal.item?.postedBy}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 1: Form Content */}
              {paymentStep === 'form' && (
                <>
                  <div className="p-6 overflow-y-auto flex-1">
                    {claimError && (
                      <div className={`mb-4 p-3 rounded-2xl text-sm ${darkMode ? 'bg-red-900/50 border border-red-700 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                        {claimError}
                      </div>
                    )}

                    {/* Verification Description */}
                    <div className="mb-5">
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                        How can you prove this is yours? <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={claimForm.verificationDescription}
                        onChange={(e) => setClaimForm({ ...claimForm, verificationDescription: e.target.value })}
                        placeholder="Describe unique features only the owner would know (e.g., contents of wallet, scratches, stickers, custom marks, serial numbers...)"
                        rows={4}
                        className={`w-full px-4 py-3 border rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-orange-200 text-gray-700'}`}
                      />
                      <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Be specific! The finder will use this to verify your ownership.
                      </p>
                    </div>

                    {/* Link to Existing Lost Post */}
                    {userLostPosts.length > 0 && (
                      <div className="mb-5">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Link to Your Lost Post
                        </label>
                        <div className="space-y-2">
                          {/* Option: Don't link */}
                          <div
                            onClick={() => setSelectedLostPost(null)}
                            className={`p-3 border rounded-2xl cursor-pointer transition-all ${
                              !selectedLostPost
                                ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-500'
                                : 'border-orange-200 hover:border-orange-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                !selectedLostPost ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                              }`}>
                                {!selectedLostPost && (
                                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              <span className="text-gray-700 font-medium">New claim (no existing post)</span>
                            </div>
                          </div>

                          {/* User's lost posts */}
                          {userLostPosts.map((post) => (
                            <div
                              key={post.id}
                              onClick={() => setSelectedLostPost(post)}
                              className={`p-3 border rounded-2xl cursor-pointer transition-all ${
                                selectedLostPost?.id === post.id
                                  ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-500'
                                  : 'border-orange-200 hover:border-orange-300'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                  selectedLostPost?.id === post.id ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                                }`}>
                                  {selectedLostPost?.id === post.id && (
                                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <p className="text-gray-700 font-medium">{post.title}</p>
                                  <p className="text-xs text-gray-500">
                                    Posted {formatDate(post.createdAt)} • Reward: ${parseFloat(post.bounty_amount || 0).toFixed(2)} CAD
                                  </p>
                                </div>
                                {parseFloat(post.bounty_amount) > 0 && (
                                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                    ${parseFloat(post.bounty_amount).toFixed(0)} reward
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {selectedLostPost && (
                          <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-xl">
                            <p className="text-xs text-green-700">
                              <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Your posted reward of <strong>${parseFloat(selectedLostPost.bounty_amount || 0).toFixed(2)} CAD</strong> will be used. This ensures you honor your original commitment.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bounty/Reward Offer - Only show if no lost post linked */}
                    {!selectedLostPost && (
                      <div className="mb-5">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Finder's Reward (Optional)
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                          <input
                            type="number"
                            value={claimForm.bountyOffered}
                            onChange={(e) => {
                              const value = Math.min(50, Math.max(0, parseFloat(e.target.value) || 0));
                              setClaimForm({ ...claimForm, bountyOffered: value || '' });
                            }}
                            placeholder="0"
                            min="0"
                            max="50"
                            className="w-full pl-8 pr-16 py-3 border border-orange-200 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-700"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">CAD</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Offer a reward to thank the finder (max $50 CAD)
                        </p>
                      </div>
                    )}

                    {/* Optional Proof Photo */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Proof Photo (Optional)
                      </label>
                      <div
                        onClick={() => claimProofInputRef.current?.click()}
                        className="border-2 border-dashed border-orange-200 rounded-2xl p-4 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 transition-all"
                      >
                        {claimForm.proofPhoto ? (
                          <div className="flex items-center justify-center gap-3">
                            <img
                              src={URL.createObjectURL(claimForm.proofPhoto)}
                              alt="Proof"
                              className="w-16 h-16 rounded-xl object-cover"
                            />
                            <div className="text-left">
                              <p className="text-sm text-gray-700 font-medium">Photo added</p>
                              <p className="text-xs text-gray-500">Click to change</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <svg className="w-8 h-8 text-orange-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-sm text-gray-600">Upload proof (receipt, matching photo, etc.)</p>
                          </>
                        )}
                      </div>
                      <input
                        ref={claimProofInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setClaimForm({ ...claimForm, proofPhoto: file });
                          }
                        }}
                        className="hidden"
                      />
                    </div>

                    {/* Anti-Selling Notice */}
                    <div className="p-3 bg-red-50 border border-red-200 rounded-2xl mb-3">
                      <div className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="text-xs text-red-700">
                          <strong>Not a marketplace!</strong> This is for returning lost items to rightful owners.
                          Do not offer to purchase items. Buying/selling is prohibited and will result in account ban.
                        </p>
                      </div>
                    </div>

                    {/* Fee Notice */}
                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-2xl">
                      <div className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-xs text-orange-700">
                          <strong>$5 CAD Connection Fee:</strong> A small fee is charged to contact the finder.
                          This helps prevent buying and selling of lost items and ensures serious claims only.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Form Footer */}
                  <div className="p-6 border-t border-gray-100 flex gap-3 flex-shrink-0">
                    <button
                      onClick={() => {
                        setClaimModal(null);
                        setClaimForm({ verificationDescription: '', bountyOffered: '', proofPhoto: null });
                        setPaymentStep('form');
                        setClaimError('');
                      }}
                      className="flex-1 px-4 py-3 border border-orange-200 text-gray-700 rounded-full font-medium hover:bg-orange-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleProceedToPayment}
                      disabled={!claimForm.verificationDescription.trim()}
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-full font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      Continue to Payment
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </>
              )}

              {/* STEP 2: Payment Form */}
              {paymentStep === 'payment' && (
                <>
                  <div className="p-6 overflow-y-auto flex-1">
                    {claimError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm">
                        {claimError}
                      </div>
                    )}

                    {/* Test Mode Banner */}
                    <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <p className="text-sm text-purple-700 font-medium">
                          Test Mode - Use any card number
                        </p>
                      </div>
                    </div>

                    {/* Payment Summary */}
                    <div className="mb-5 p-4 bg-gray-50 rounded-2xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-600">Connection Fee</span>
                        <span className="font-medium">$5.00 CAD</span>
                      </div>
                      {getEffectiveBounty() > 0 && (
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-gray-600">
                            Finder's Reward
                            {selectedLostPost && <span className="text-xs text-green-600 ml-1">(from your post)</span>}
                          </span>
                          <span className="font-medium">${getEffectiveBounty().toFixed(2)} CAD</span>
                        </div>
                      )}
                      <div className="border-t border-gray-200 pt-2 mt-2">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-900">Total Due Now</span>
                          <span className="font-bold text-lg text-orange-600">
                            ${(5 + getEffectiveBounty()).toFixed(2)} CAD
                          </span>
                        </div>
                      </div>
                      {getEffectiveBounty() > 0 && (
                        <div className="mt-3 p-2 bg-blue-50 rounded-xl">
                          <p className="text-xs text-blue-700">
                            <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            The finder's reward will be held securely and only released to the finder when both parties confirm the item exchange.
                          </p>
                        </div>
                      )}
                      {selectedLostPost && (
                        <div className="mt-3 p-2 bg-green-50 rounded-xl">
                          <p className="text-xs text-green-700">
                            <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            Linked to: <strong>{selectedLostPost.title}</strong>
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Stripe-like Card Form */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Card Number
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={paymentForm.cardNumber}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '').slice(0, 16);
                              const formatted = value.replace(/(\d{4})(?=\d)/g, '$1 ');
                              setPaymentForm({ ...paymentForm, cardNumber: formatted });
                            }}
                            placeholder="4242 4242 4242 4242"
                            className="w-full px-4 py-3 border border-orange-200 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-700 pr-12"
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                            <svg className="w-8 h-5 text-blue-600" viewBox="0 0 32 20" fill="currentColor">
                              <rect width="32" height="20" rx="2" fill="#1A1F71"/>
                              <path d="M12 14.5L13.5 6H16L14.5 14.5H12Z" fill="#FFFFFF"/>
                              <path d="M21 6L19 14.5H16.5L18.5 6H21Z" fill="#FFFFFF"/>
                            </svg>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Expiry Date
                          </label>
                          <input
                            type="text"
                            value={paymentForm.expiry}
                            onChange={(e) => {
                              let value = e.target.value.replace(/\D/g, '').slice(0, 4);
                              if (value.length >= 2) {
                                value = value.slice(0, 2) + '/' + value.slice(2);
                              }
                              setPaymentForm({ ...paymentForm, expiry: value });
                            }}
                            placeholder="MM/YY"
                            className="w-full px-4 py-3 border border-orange-200 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-700"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            CVV
                          </label>
                          <input
                            type="text"
                            value={paymentForm.cvv}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                              setPaymentForm({ ...paymentForm, cvv: value });
                            }}
                            placeholder="123"
                            className="w-full px-4 py-3 border border-orange-200 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-700"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Cardholder Name
                        </label>
                        <input
                          type="text"
                          value={paymentForm.name}
                          onChange={(e) => setPaymentForm({ ...paymentForm, name: e.target.value })}
                          placeholder="John Doe"
                          className="w-full px-4 py-3 border border-orange-200 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-700"
                        />
                      </div>
                    </div>

                    {/* Secure Payment Notice */}
                    <div className="mt-4 flex items-center justify-center gap-2 text-gray-500 text-xs">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Secured with SSL encryption
                    </div>
                  </div>

                  {/* Payment Footer */}
                  <div className="p-6 border-t border-gray-100 flex gap-3 flex-shrink-0">
                    <button
                      onClick={() => setPaymentStep('form')}
                      className="flex-1 px-4 py-3 border border-orange-200 text-gray-700 rounded-full font-medium hover:bg-orange-50 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handlePaymentSubmit}
                      disabled={!paymentForm.cardNumber || !paymentForm.expiry || !paymentForm.cvv || !paymentForm.name}
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-full font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Pay ${(5 + getEffectiveBounty()).toFixed(2)} CAD
                    </button>
                  </div>
                </>
              )}

              {/* STEP 3: Processing */}
              {paymentStep === 'processing' && (
                <div className="p-12 flex flex-col items-center justify-center flex-1">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-orange-200 rounded-full"></div>
                    <div className="w-20 h-20 border-4 border-orange-500 border-t-transparent rounded-full absolute top-0 left-0 animate-spin"></div>
                  </div>
                  <p className="mt-6 text-lg font-medium text-gray-700">Processing Payment...</p>
                  <p className="mt-2 text-sm text-gray-500">Please wait while we process your payment</p>
                </div>
              )}

              {/* STEP 4: Success */}
              {paymentStep === 'success' && (
                <>
                  <div className="p-8 flex flex-col items-center justify-center flex-1 text-center">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                      <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h3>
                    <p className="text-gray-600 mb-6">
                      Your claim has been submitted. The finder will review your verification details and respond soon.
                    </p>

                    <div className="w-full p-4 bg-orange-50 rounded-2xl mb-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={claimModal.item?.image}
                          alt={claimModal.item?.title}
                          className="w-12 h-12 rounded-xl object-cover"
                        />
                        <div className="text-left flex-1">
                          <p className="font-medium text-gray-900">{claimModal.item?.title}</p>
                          <p className="text-sm text-gray-500">Claim pending review</p>
                        </div>
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                          Pending
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500">
                      You'll be notified when the finder responds to your claim.
                    </p>
                  </div>

                  {/* Success Footer */}
                  <div className="p-6 border-t border-gray-100 flex-shrink-0">
                    <button
                      onClick={handleClaimSuccess}
                      className="w-full px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-full font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      View My Claims
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Chat Modal */}
        {chatModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`rounded-3xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              {/* Chat Header */}
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-4 rounded-t-3xl flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold">
                        {chatModal.otherParty?.first_name} {chatModal.otherParty?.last_name}
                      </h3>
                      <p className="text-orange-100 text-sm">{chatModal.itemTitle}</p>
                    </div>
                  </div>
                  <button
                    onClick={closeChat}
                    className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {/* Complete Transaction Button */}
                {chatModal.claim?.status === 'accepted' && (
                  <div className="mt-3 pt-3 border-t border-white/20">
                    <button
                      onClick={confirmHandover}
                      disabled={isConfirmingHandover}
                      className="w-full bg-white text-orange-600 font-semibold py-2 px-4 rounded-full hover:bg-orange-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isConfirmingHandover ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500"></div>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Mark Transaction Complete
                        </>
                      )}
                    </button>
                    <p className="text-xs text-orange-100 text-center mt-1">
                      Both parties must confirm to complete
                    </p>
                  </div>
                )}
                {chatModal.claim?.status === 'completed' && (
                  <div className="mt-3 pt-3 border-t border-white/20">
                    <div className="bg-green-500 text-white py-2 px-4 rounded-full text-center font-semibold flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Transaction Completed
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Messages */}
              <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                {isLoadingChat ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <svg className={`w-12 h-12 mx-auto mb-2 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p>No messages yet</p>
                    <p className="text-sm">Start the conversation!</p>
                  </div>
                ) : (
                  chatMessages.map((msg) => {
                    const isMe = msg.sender_id === user?.id;
                    const isSystem = msg.message_type === 'system';
                    const isImage = msg.message_type === 'image';
                    const isDocument = msg.message_type === 'document';

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="flex justify-center">
                          <div className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full">
                            {msg.content}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] ${isMe ? 'order-2' : 'order-1'}`}>
                          {!isMe && (
                            <p className="text-xs text-gray-500 mb-1 ml-1">
                              {msg.sender?.first_name}
                            </p>
                          )}
                          <div
                            className={`rounded-2xl overflow-hidden ${
                              isMe
                                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-br-md'
                                : (darkMode ? 'bg-gray-700 border border-gray-600 text-gray-200' : 'bg-white border border-gray-200 text-gray-800') + ' rounded-bl-md'
                            }`}
                          >
                            {/* Image Message */}
                            {isImage && msg.metadata?.file_url && (
                              <a
                                href={`${UPLOADS_BASE_URL}${msg.metadata.file_url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <img
                                  src={`${UPLOADS_BASE_URL}${msg.metadata.file_url}`}
                                  alt="Shared image"
                                  className="max-w-full max-h-48 object-cover"
                                />
                              </a>
                            )}
                            {/* Document Message */}
                            {isDocument && msg.metadata?.file_url && (
                              <a
                                href={`${UPLOADS_BASE_URL}${msg.metadata.file_url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 px-4 py-3 ${isMe ? 'hover:bg-orange-700' : 'hover:bg-gray-50'}`}
                              >
                                <svg className="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate">{msg.metadata.file_name}</p>
                                  <p className={`text-xs ${isMe ? 'text-orange-100' : 'text-gray-500'}`}>
                                    {(msg.metadata.file_size / 1024).toFixed(1)} KB
                                  </p>
                                </div>
                              </a>
                            )}
                            {/* Text Message */}
                            {!isImage && !isDocument && (
                              <p className="text-sm whitespace-pre-wrap px-4 py-2">{msg.content}</p>
                            )}
                          </div>
                          <p className={`text-xs text-gray-400 mt-1 ${isMe ? 'text-right mr-1' : 'ml-1'}`}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatMessagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className={`p-4 border-t flex-shrink-0 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-white'}`}>
                {/* Hidden file input */}
                <input
                  type="file"
                  ref={chatFileInputRef}
                  onChange={handleChatFileSelect}
                  accept="image/*,.pdf,.doc,.docx"
                  className="hidden"
                />
                <div className="flex gap-2">
                  {/* Upload Button */}
                  <button
                    onClick={() => chatFileInputRef.current?.click()}
                    disabled={isUploadingFile}
                    className={`w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    title="Upload file or photo"
                  >
                    {isUploadingFile ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    )}
                  </button>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                  <button
                    onClick={sendChatMessage}
                    disabled={!chatInput.trim() || isSendingMessage}
                    className="w-10 h-10 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-full flex items-center justify-center hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isSendingMessage ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
