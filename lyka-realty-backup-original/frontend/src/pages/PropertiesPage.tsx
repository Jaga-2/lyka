import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Filter,
  SlidersHorizontal,
  MapPin,
  Bed,
  Sparkles,
  ChevronDown,
  X,
  RefreshCw,
} from 'lucide-react';
import { PropertyCard } from '../components/PropertyCard';
import { Property, PropertySearchParams } from '../types';
import { api } from '../services/api';

export const PropertiesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialLocation = searchParams.get('location') || '';
  const initialPurpose = searchParams.get('purpose') || 'For Rent';

  const [properties, setProperties] = useState<Property[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState('');

  // Filters
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState(initialLocation);
  const [purpose, setPurpose] = useState(initialPurpose);
  const [beds, setBeds] = useState<string>('');
  const [propertyType, setPropertyType] = useState<string>('');
  const [furnishing, setFurnishing] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [sortBy, setSortBy] = useState<'price_asc' | 'price_desc' | 'beds' | 'area'>('price_asc');
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  const [availableLocations, setAvailableLocations] = useState<string[]>([]);

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const params: PropertySearchParams = {
        query: query || undefined,
        location: location || undefined,
        purpose: purpose || undefined,
        beds: beds ? Number(beds) : undefined,
        property_type: propertyType || undefined,
        furnishing: furnishing || undefined,
        max_price: maxPrice ? Number(maxPrice) : undefined,
        sort_by: sortBy,
        limit: 30,
      };

      const res = await api.searchProperties(params);
      setProperties(res.properties);
      setTotal(res.total);
      setSearchError('');
    } catch (error) {
      console.error('Unable to search property inventory:', error);
      setProperties([]);
      setTotal(0);
      setSearchError('Property inventory is currently unavailable. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, [location, purpose, beds, propertyType, furnishing, maxPrice, sortBy]);

  useEffect(() => {
    api.getFilterOptions()
      .then((options) => setAvailableLocations(options.locations))
      .catch((error) => console.error('Unable to load property filter options:', error));
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProperties();
  };

  const clearFilters = () => {
    setQuery('');
    setLocation('');
    setPurpose('For Rent');
    setBeds('');
    setPropertyType('');
    setFurnishing('');
    setMaxPrice('');
    setSortBy('price_asc');
  };

  return (
    <div className="page-wrapper" style={{ backgroundColor: 'var(--bg-dark)' }}>
      <div className="app-container">
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ color: '#fff', fontSize: '2.2rem', marginBottom: '0.5rem' }}>
            Explore Verified UAE Real Estate
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Browse residential rental listings using prices from the supplied inventory.
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            marginBottom: '2rem',
          }}
        >
          {/* Main search input */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by tower name, community, address (e.g. Marina Gate, West Avenue)..."
                className="input-luxury"
                style={{ paddingLeft: '42px' }}
              />
            </div>
            <button type="submit" className="btn btn-gold" style={{ padding: '0.75rem 1.75rem' }}>
              Search
            </button>
          </form>

          {/* Quick Filter Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '10px',
            }}
          >
            {/* Location */}
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="input-luxury"
              style={{ fontSize: '0.85rem' }}
            >
              <option value="">All Locations</option>
              {availableLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>

            {/* Purpose */}
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="input-luxury"
              style={{ fontSize: '0.85rem' }}
            >
              <option value="">Buy or Rent (Any)</option>
              <option value="For Sale">For Sale (Buy)</option>
              <option value="For Rent">For Rent</option>
            </select>

            {/* Bedrooms */}
            <select
              value={beds}
              onChange={(e) => setBeds(e.target.value)}
              className="input-luxury"
              style={{ fontSize: '0.85rem' }}
            >
              <option value="">Any Bedrooms</option>
              <option value="0">Studio</option>
              <option value="1">1 Bedroom</option>
              <option value="2">2 Bedrooms</option>
              <option value="3">3 Bedrooms</option>
              <option value="4">4+ Bedrooms</option>
            </select>

            {/* Property Type */}
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className="input-luxury"
              style={{ fontSize: '0.85rem' }}
            >
              <option value="">Any Type</option>
              <option value="Apartment">Apartment</option>
              <option value="Villa">Villa</option>
              <option value="Townhouse">Townhouse</option>
              <option value="Penthouse">Penthouse</option>
            </select>

            {/* Furnishing */}
            <select
              value={furnishing}
              onChange={(e) => setFurnishing(e.target.value)}
              className="input-luxury"
              style={{ fontSize: '0.85rem' }}
            >
              <option value="">Any Furnishing</option>
              <option value="Furnished">Furnished</option>
              <option value="Unfurnished">Unfurnished</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="input-luxury"
              style={{ fontSize: '0.85rem' }}
            >
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="beds">Bedrooms</option>
              <option value="area">Area (Sqft)</option>
            </select>
          </div>

          {/* Active filter count / Clear */}
          {(location || purpose || beds || propertyType || furnishing || query) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Active filters applied
              </div>
              <button
                onClick={clearFilters}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--gold)',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <X size={14} />
                <span>Reset All Filters</span>
              </button>
            </div>
          )}
        </div>

        {/* Results Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1rem', color: '#fff', fontWeight: 600 }}>
            {loading ? 'Searching database...' : searchError ? 'Property inventory unavailable' : `Found ${total} Properties`}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
            All prices in UAE Dirhams (AED)
          </div>
        </div>

        {/* Grid of Properties */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <RefreshCw size={32} color="var(--gold)" className="animate-spin" style={{ margin: '0 auto 1rem' }} />
            <p style={{ color: 'var(--text-muted)' }}>Loading real estate inventory...</p>
          </div>
        ) : properties.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '4rem 2rem',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
            }}
          >
            <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>No Matching Properties Found</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', maxWidth: '500px', margin: '0 auto 1.5rem' }}>
              {searchError || 'We could not find properties matching all selected filters. Try broadening your criteria or speak directly with LYKA AI.'}
            </p>
            <button onClick={clearFilters} className="btn btn-outline" style={{ marginRight: '10px' }}>
              Reset Filters
            </button>
            <a href="/ai" className="btn btn-gold">
              <Sparkles size={16} />
              Ask LYKA AI to Find Matches
            </a>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1.75rem',
            }}
          >
            {properties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
