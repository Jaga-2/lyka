import React, { createContext, useContext, useState, useEffect } from 'react';
import { Property } from '../types';
import { useAuth } from './AuthContext';
import { api } from '../services/api';

interface PropertyContextType {
  shortlist: Property[];
  toggleShortlist: (property: Property) => void;
  isShortlisted: (id: number) => boolean;
  compareList: Property[];
  addToCompare: (property: Property) => void;
  removeFromCompare: (id: number) => void;
  isComparing: (id: number) => boolean;
  clearCompare: () => void;
  // Modals
  siteVisitProperty: Property | null;
  siteVisitConversationId: string | null;
  openSiteVisitModal: (property: Property, conversationId?: string) => void;
  closeSiteVisitModal: () => void;
  emiProperty: Property | null;
  openEMIModal: (property: Property) => void;
  closeEMIModal: () => void;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export const PropertyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [shortlist, setShortlist] = useState<Property[]>([]);
  const [shortlistUserId, setShortlistUserId] = useState<number | null>(null);
  const visibleShortlist = user && shortlistUserId === user.id ? shortlist : [];

  const [compareList, setCompareList] = useState<Property[]>(() => {
    try {
      const saved = localStorage.getItem('lyka_compare');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [siteVisitProperty, setSiteVisitProperty] = useState<Property | null>(null);
  const [siteVisitConversationId, setSiteVisitConversationId] = useState<string | null>(null);
  const [emiProperty, setEmiProperty] = useState<Property | null>(null);

  useEffect(() => {
    let active = true;
    if (user) {
      api.getShortlist()
        .then((saved) => {
          if (active) {
            setShortlist(saved);
            setShortlistUserId(user.id);
          }
        })
        .catch((error: Error) => {
          console.error('Unable to load saved properties:', error);
          const isAuthError = error?.message && (
            error.message.includes('401') ||
            error.message.includes('credentials were not provided') ||
            error.message.includes('invalid') ||
            error.message.includes('Unauthorized')
          );
          if (active && !isAuthError) {
            window.alert(`Saved properties could not be loaded: ${error.message}`);
          }
        });
    } else {
      setShortlist([]);
      setShortlistUserId(null);
    }
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    localStorage.setItem('lyka_compare', JSON.stringify(compareList));
  }, [compareList]);

  const toggleShortlist = async (property: Property) => {
    if (!user) {
      window.alert('Sign in to save properties to your account.');
      return;
    }
    try {
      const result = await api.toggleShortlist(property.id);
      setShortlistUserId(user.id);
      setShortlist((previous) => result.is_shortlisted
        ? [...previous.filter((item) => item.id !== property.id), property]
        : previous.filter((item) => item.id !== property.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update saved properties.';
      window.alert(message);
    }
  };

  const isShortlisted = (id: number) => {
    return visibleShortlist.some((p) => p.id === id);
  };

  const addToCompare = (property: Property) => {
    setCompareList((prev) => {
      if (prev.some((p) => p.id === property.id)) return prev;
      if (prev.length >= 4) {
        alert('You can compare up to 4 properties at a time.');
        return prev;
      }
      return [...prev, property];
    });
  };

  const removeFromCompare = (id: number) => {
    setCompareList((prev) => prev.filter((p) => p.id !== id));
  };

  const isComparing = (id: number) => {
    return compareList.some((p) => p.id === id);
  };

  const clearCompare = () => {
    setCompareList([]);
  };

  const openSiteVisitModal = (property: Property, conversationId?: string) => {
    setSiteVisitProperty(property);
    setSiteVisitConversationId(conversationId || null);
  };

  const closeSiteVisitModal = () => {
    setSiteVisitProperty(null);
    setSiteVisitConversationId(null);
  };

  const openEMIModal = (property: Property) => {
    setEmiProperty(property);
  };

  const closeEMIModal = () => {
    setEmiProperty(null);
  };

  return (
    <PropertyContext.Provider
      value={{
        shortlist: visibleShortlist,
        toggleShortlist,
        isShortlisted,
        compareList,
        addToCompare,
        removeFromCompare,
        isComparing,
        clearCompare,
        siteVisitProperty,
        siteVisitConversationId,
        openSiteVisitModal,
        closeSiteVisitModal,
        emiProperty,
        openEMIModal,
        closeEMIModal,
      }}
    >
      {children}
    </PropertyContext.Provider>
  );
};

export const useProperty = () => {
  const context = useContext(PropertyContext);
  if (!context) throw new Error('useProperty must be used within a PropertyProvider');
  return context;
};
