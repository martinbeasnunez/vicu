"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { COUNTRY_CODES, type CountryCode } from "@/lib/country-codes";

interface CountryCodeSelectProps {
  value: string;
  onChange: (code: string) => void;
  className?: string;
}

export default function CountryCodeSelect({
  value,
  onChange,
  className = "",
}: CountryCodeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === value) || COUNTRY_CODES[0];

  const filteredCountries = useMemo(() => {
    if (!search.trim()) return COUNTRY_CODES;
    const s = search.toLowerCase();
    return COUNTRY_CODES.filter(
      (c) => c.country.toLowerCase().includes(s) || c.code.includes(s)
    );
  }, [search]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-3.5 text-white hover:border-slate-600 transition-all min-w-[100px]"
      >
        <span className="text-lg">{selectedCountry.flag}</span>
        <span className="text-slate-300 font-medium">{selectedCountry.code}</span>
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-700">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar país..."
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          {/* Countries list */}
          <div className="max-h-48 overflow-y-auto">
            {filteredCountries.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No encontrado</p>
            ) : (
              filteredCountries.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => {
                    onChange(country.code);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-700/50 transition-colors ${
                    country.code === value ? "bg-indigo-500/20" : ""
                  }`}
                >
                  <span className="text-lg">{country.flag}</span>
                  <span className="text-white text-sm flex-1">{country.country}</span>
                  <span className="text-slate-400 text-sm">{country.code}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
