import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <Link to="/" className="navbar-logo">
        NETFLIX
      </Link>

      <div className="navbar-links">
        <Link to="/" className="navbar-link">Home</Link>
        <Link to="/search" className="navbar-link">Search</Link>
        <Link to="/mylist" className="navbar-link">My List</Link>

        {user && (
          <div className="navbar-profile">
            <span>{user.name}</span>
            <button onClick={handleLogout} className="navbar-logout">
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
