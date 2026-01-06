"use client";

import { useState, useMemo } from "react";

interface WhatsAppOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// All country codes sorted by country name
const COUNTRY_CODES = [
  { code: "+93", country: "Afganistán", flag: "🇦🇫" },
  { code: "+355", country: "Albania", flag: "🇦🇱" },
  { code: "+49", country: "Alemania", flag: "🇩🇪" },
  { code: "+376", country: "Andorra", flag: "🇦🇩" },
  { code: "+244", country: "Angola", flag: "🇦🇴" },
  { code: "+1268", country: "Antigua y Barbuda", flag: "🇦🇬" },
  { code: "+966", country: "Arabia Saudita", flag: "🇸🇦" },
  { code: "+213", country: "Argelia", flag: "🇩🇿" },
  { code: "+54", country: "Argentina", flag: "🇦🇷" },
  { code: "+374", country: "Armenia", flag: "🇦🇲" },
  { code: "+61", country: "Australia", flag: "🇦🇺" },
  { code: "+43", country: "Austria", flag: "🇦🇹" },
  { code: "+994", country: "Azerbaiyán", flag: "🇦🇿" },
  { code: "+1242", country: "Bahamas", flag: "🇧🇸" },
  { code: "+880", country: "Bangladesh", flag: "🇧🇩" },
  { code: "+1246", country: "Barbados", flag: "🇧🇧" },
  { code: "+973", country: "Baréin", flag: "🇧🇭" },
  { code: "+32", country: "Bélgica", flag: "🇧🇪" },
  { code: "+501", country: "Belice", flag: "🇧🇿" },
  { code: "+229", country: "Benín", flag: "🇧🇯" },
  { code: "+375", country: "Bielorrusia", flag: "🇧🇾" },
  { code: "+591", country: "Bolivia", flag: "🇧🇴" },
  { code: "+387", country: "Bosnia y Herzegovina", flag: "🇧🇦" },
  { code: "+267", country: "Botsuana", flag: "🇧🇼" },
  { code: "+55", country: "Brasil", flag: "🇧🇷" },
  { code: "+673", country: "Brunéi", flag: "🇧🇳" },
  { code: "+359", country: "Bulgaria", flag: "🇧🇬" },
  { code: "+226", country: "Burkina Faso", flag: "🇧🇫" },
  { code: "+257", country: "Burundi", flag: "🇧🇮" },
  { code: "+975", country: "Bután", flag: "🇧🇹" },
  { code: "+238", country: "Cabo Verde", flag: "🇨🇻" },
  { code: "+855", country: "Camboya", flag: "🇰🇭" },
  { code: "+237", country: "Camerún", flag: "🇨🇲" },
  { code: "+1", country: "Canadá", flag: "🇨🇦" },
  { code: "+974", country: "Catar", flag: "🇶🇦" },
  { code: "+235", country: "Chad", flag: "🇹🇩" },
  { code: "+56", country: "Chile", flag: "🇨🇱" },
  { code: "+86", country: "China", flag: "🇨🇳" },
  { code: "+357", country: "Chipre", flag: "🇨🇾" },
  { code: "+57", country: "Colombia", flag: "🇨🇴" },
  { code: "+269", country: "Comoras", flag: "🇰🇲" },
  { code: "+82", country: "Corea del Sur", flag: "🇰🇷" },
  { code: "+506", country: "Costa Rica", flag: "🇨🇷" },
  { code: "+225", country: "Costa de Marfil", flag: "🇨🇮" },
  { code: "+385", country: "Croacia", flag: "🇭🇷" },
  { code: "+53", country: "Cuba", flag: "🇨🇺" },
  { code: "+45", country: "Dinamarca", flag: "🇩🇰" },
  { code: "+1767", country: "Dominica", flag: "🇩🇲" },
  { code: "+593", country: "Ecuador", flag: "🇪🇨" },
  { code: "+20", country: "Egipto", flag: "🇪🇬" },
  { code: "+503", country: "El Salvador", flag: "🇸🇻" },
  { code: "+971", country: "Emiratos Árabes Unidos", flag: "🇦🇪" },
  { code: "+291", country: "Eritrea", flag: "🇪🇷" },
  { code: "+421", country: "Eslovaquia", flag: "🇸🇰" },
  { code: "+386", country: "Eslovenia", flag: "🇸🇮" },
  { code: "+34", country: "España", flag: "🇪🇸" },
  { code: "+1", country: "Estados Unidos", flag: "🇺🇸" },
  { code: "+372", country: "Estonia", flag: "🇪🇪" },
  { code: "+251", country: "Etiopía", flag: "🇪🇹" },
  { code: "+679", country: "Fiyi", flag: "🇫🇯" },
  { code: "+63", country: "Filipinas", flag: "🇵🇭" },
  { code: "+358", country: "Finlandia", flag: "🇫🇮" },
  { code: "+33", country: "Francia", flag: "🇫🇷" },
  { code: "+241", country: "Gabón", flag: "🇬🇦" },
  { code: "+220", country: "Gambia", flag: "🇬🇲" },
  { code: "+995", country: "Georgia", flag: "🇬🇪" },
  { code: "+233", country: "Ghana", flag: "🇬🇭" },
  { code: "+30", country: "Grecia", flag: "🇬🇷" },
  { code: "+1473", country: "Granada", flag: "🇬🇩" },
  { code: "+502", country: "Guatemala", flag: "🇬🇹" },
  { code: "+224", country: "Guinea", flag: "🇬🇳" },
  { code: "+240", country: "Guinea Ecuatorial", flag: "🇬🇶" },
  { code: "+245", country: "Guinea-Bisáu", flag: "🇬🇼" },
  { code: "+592", country: "Guyana", flag: "🇬🇾" },
  { code: "+509", country: "Haití", flag: "🇭🇹" },
  { code: "+504", country: "Honduras", flag: "🇭🇳" },
  { code: "+852", country: "Hong Kong", flag: "🇭🇰" },
  { code: "+36", country: "Hungría", flag: "🇭🇺" },
  { code: "+91", country: "India", flag: "🇮🇳" },
  { code: "+62", country: "Indonesia", flag: "🇮🇩" },
  { code: "+964", country: "Irak", flag: "🇮🇶" },
  { code: "+98", country: "Irán", flag: "🇮🇷" },
  { code: "+353", country: "Irlanda", flag: "🇮🇪" },
  { code: "+354", country: "Islandia", flag: "🇮🇸" },
  { code: "+972", country: "Israel", flag: "🇮🇱" },
  { code: "+39", country: "Italia", flag: "🇮🇹" },
  { code: "+1876", country: "Jamaica", flag: "🇯🇲" },
  { code: "+81", country: "Japón", flag: "🇯🇵" },
  { code: "+962", country: "Jordania", flag: "🇯🇴" },
  { code: "+7", country: "Kazajistán", flag: "🇰🇿" },
  { code: "+254", country: "Kenia", flag: "🇰🇪" },
  { code: "+996", country: "Kirguistán", flag: "🇰🇬" },
  { code: "+686", country: "Kiribati", flag: "🇰🇮" },
  { code: "+965", country: "Kuwait", flag: "🇰🇼" },
  { code: "+856", country: "Laos", flag: "🇱🇦" },
  { code: "+266", country: "Lesoto", flag: "🇱🇸" },
  { code: "+371", country: "Letonia", flag: "🇱🇻" },
  { code: "+961", country: "Líbano", flag: "🇱🇧" },
  { code: "+231", country: "Liberia", flag: "🇱🇷" },
  { code: "+218", country: "Libia", flag: "🇱🇾" },
  { code: "+423", country: "Liechtenstein", flag: "🇱🇮" },
  { code: "+370", country: "Lituania", flag: "🇱🇹" },
  { code: "+352", country: "Luxemburgo", flag: "🇱🇺" },
  { code: "+389", country: "Macedonia del Norte", flag: "🇲🇰" },
  { code: "+261", country: "Madagascar", flag: "🇲🇬" },
  { code: "+60", country: "Malasia", flag: "🇲🇾" },
  { code: "+265", country: "Malaui", flag: "🇲🇼" },
  { code: "+960", country: "Maldivas", flag: "🇲🇻" },
  { code: "+223", country: "Malí", flag: "🇲🇱" },
  { code: "+356", country: "Malta", flag: "🇲🇹" },
  { code: "+212", country: "Marruecos", flag: "🇲🇦" },
  { code: "+230", country: "Mauricio", flag: "🇲🇺" },
  { code: "+222", country: "Mauritania", flag: "🇲🇷" },
  { code: "+52", country: "México", flag: "🇲🇽" },
  { code: "+373", country: "Moldavia", flag: "🇲🇩" },
  { code: "+377", country: "Mónaco", flag: "🇲🇨" },
  { code: "+976", country: "Mongolia", flag: "🇲🇳" },
  { code: "+382", country: "Montenegro", flag: "🇲🇪" },
  { code: "+258", country: "Mozambique", flag: "🇲🇿" },
  { code: "+95", country: "Myanmar", flag: "🇲🇲" },
  { code: "+264", country: "Namibia", flag: "🇳🇦" },
  { code: "+674", country: "Nauru", flag: "🇳🇷" },
  { code: "+977", country: "Nepal", flag: "🇳🇵" },
  { code: "+505", country: "Nicaragua", flag: "🇳🇮" },
  { code: "+227", country: "Níger", flag: "🇳🇪" },
  { code: "+234", country: "Nigeria", flag: "🇳🇬" },
  { code: "+47", country: "Noruega", flag: "🇳🇴" },
  { code: "+64", country: "Nueva Zelanda", flag: "🇳🇿" },
  { code: "+968", country: "Omán", flag: "🇴🇲" },
  { code: "+31", country: "Países Bajos", flag: "🇳🇱" },
  { code: "+92", country: "Pakistán", flag: "🇵🇰" },
  { code: "+680", country: "Palaos", flag: "🇵🇼" },
  { code: "+507", country: "Panamá", flag: "🇵🇦" },
  { code: "+675", country: "Papúa Nueva Guinea", flag: "🇵🇬" },
  { code: "+595", country: "Paraguay", flag: "🇵🇾" },
  { code: "+51", country: "Perú", flag: "🇵🇪" },
  { code: "+48", country: "Polonia", flag: "🇵🇱" },
  { code: "+351", country: "Portugal", flag: "🇵🇹" },
  { code: "+1787", country: "Puerto Rico", flag: "🇵🇷" },
  { code: "+44", country: "Reino Unido", flag: "🇬🇧" },
  { code: "+236", country: "República Centroafricana", flag: "🇨🇫" },
  { code: "+420", country: "República Checa", flag: "🇨🇿" },
  { code: "+243", country: "República Democrática del Congo", flag: "🇨🇩" },
  { code: "+1809", country: "República Dominicana", flag: "🇩🇴" },
  { code: "+40", country: "Rumania", flag: "🇷🇴" },
  { code: "+7", country: "Rusia", flag: "🇷🇺" },
  { code: "+250", country: "Ruanda", flag: "🇷🇼" },
  { code: "+1869", country: "San Cristóbal y Nieves", flag: "🇰🇳" },
  { code: "+378", country: "San Marino", flag: "🇸🇲" },
  { code: "+1784", country: "San Vicente y las Granadinas", flag: "🇻🇨" },
  { code: "+1758", country: "Santa Lucía", flag: "🇱🇨" },
  { code: "+239", country: "Santo Tomé y Príncipe", flag: "🇸🇹" },
  { code: "+221", country: "Senegal", flag: "🇸🇳" },
  { code: "+381", country: "Serbia", flag: "🇷🇸" },
  { code: "+248", country: "Seychelles", flag: "🇸🇨" },
  { code: "+232", country: "Sierra Leona", flag: "🇸🇱" },
  { code: "+65", country: "Singapur", flag: "🇸🇬" },
  { code: "+963", country: "Siria", flag: "🇸🇾" },
  { code: "+252", country: "Somalia", flag: "🇸🇴" },
  { code: "+94", country: "Sri Lanka", flag: "🇱🇰" },
  { code: "+268", country: "Suazilandia", flag: "🇸🇿" },
  { code: "+27", country: "Sudáfrica", flag: "🇿🇦" },
  { code: "+249", country: "Sudán", flag: "🇸🇩" },
  { code: "+46", country: "Suecia", flag: "🇸🇪" },
  { code: "+41", country: "Suiza", flag: "🇨🇭" },
  { code: "+597", country: "Surinam", flag: "🇸🇷" },
  { code: "+66", country: "Tailandia", flag: "🇹🇭" },
  { code: "+886", country: "Taiwán", flag: "🇹🇼" },
  { code: "+255", country: "Tanzania", flag: "🇹🇿" },
  { code: "+992", country: "Tayikistán", flag: "🇹🇯" },
  { code: "+670", country: "Timor Oriental", flag: "🇹🇱" },
  { code: "+228", country: "Togo", flag: "🇹🇬" },
  { code: "+676", country: "Tonga", flag: "🇹🇴" },
  { code: "+1868", country: "Trinidad y Tobago", flag: "🇹🇹" },
  { code: "+216", country: "Túnez", flag: "🇹🇳" },
  { code: "+993", country: "Turkmenistán", flag: "🇹🇲" },
  { code: "+90", country: "Turquía", flag: "🇹🇷" },
  { code: "+688", country: "Tuvalu", flag: "🇹🇻" },
  { code: "+380", country: "Ucrania", flag: "🇺🇦" },
  { code: "+256", country: "Uganda", flag: "🇺🇬" },
  { code: "+598", country: "Uruguay", flag: "🇺🇾" },
  { code: "+998", country: "Uzbekistán", flag: "🇺🇿" },
  { code: "+678", country: "Vanuatu", flag: "🇻🇺" },
  { code: "+58", country: "Venezuela", flag: "🇻🇪" },
  { code: "+84", country: "Vietnam", flag: "🇻🇳" },
  { code: "+967", country: "Yemen", flag: "🇾🇪" },
  { code: "+260", country: "Zambia", flag: "🇿🇲" },
  { code: "+263", country: "Zimbabue", flag: "🇿🇼" },
];

export default function WhatsAppOnboardingModal({
  isOpen,
  onClose,
  onSuccess,
}: WhatsAppOnboardingModalProps) {
  const [countryCode, setCountryCode] = useState("+51");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countrySearch, setCountrySearch] = useState("");
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);

  // Filter countries based on search
  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return COUNTRY_CODES;
    const search = countrySearch.toLowerCase();
    return COUNTRY_CODES.filter(
      (c) =>
        c.country.toLowerCase().includes(search) ||
        c.code.includes(search)
    );
  }, [countrySearch]);

  // Get current selected country
  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0];

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanNumber = phoneNumber.replace(/\D/g, "");
    if (cleanNumber.length < 8 || cleanNumber.length > 12) {
      setError("Ingresa un número válido");
      return;
    }

    setIsLoading(true);

    try {
      const fullNumber = countryCode + cleanNumber;
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: fullNumber }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Error al guardar");
        return;
      }

      onSuccess();
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in-up">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* WhatsApp icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-white text-center mb-2">
          Activa recordatorios
        </h2>
        <p className="text-slate-400 text-center text-sm mb-6">
          Te enviaré recordatorios diarios para que no pierdas tu racha
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Tu número de WhatsApp
            </label>
            <div className="flex gap-2">
              {/* Country code selector with search */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-3 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors flex items-center gap-2 min-w-[100px]"
                >
                  <span>{selectedCountry.flag}</span>
                  <span>{selectedCountry.code}</span>
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown */}
                {isCountryDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-60 overflow-hidden">
                    {/* Search input */}
                    <div className="p-2 border-b border-slate-700">
                      <input
                        type="text"
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        placeholder="Buscar país..."
                        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                        autoFocus
                      />
                    </div>
                    {/* Country list */}
                    <div className="overflow-y-auto max-h-48">
                      {filteredCountries.map((c) => (
                        <button
                          key={`${c.code}-${c.country}`}
                          type="button"
                          onClick={() => {
                            setCountryCode(c.code);
                            setIsCountryDropdownOpen(false);
                            setCountrySearch("");
                          }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-700 transition-colors flex items-center gap-2 ${
                            c.code === countryCode ? "bg-slate-700 text-emerald-400" : "text-white"
                          }`}
                        >
                          <span>{c.flag}</span>
                          <span className="flex-1 truncate">{c.country}</span>
                          <span className="text-slate-400">{c.code}</span>
                        </button>
                      ))}
                      {filteredCountries.length === 0 && (
                        <p className="px-3 py-2 text-slate-500 text-sm">No se encontraron países</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Phone number input */}
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="Tu número"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-500"
              />
            </div>
            {error && (
              <p className="text-red-400 text-sm mt-2">{error}</p>
            )}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading || phoneNumber.length < 8}
            className="w-full bg-emerald-500 text-white font-medium py-3 rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Guardando...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Activar recordatorios
              </>
            )}
          </button>

          {/* Skip button */}
          <button
            type="button"
            onClick={onClose}
            className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2"
          >
            Ahora no
          </button>
        </form>

        {/* Privacy note */}
        <p className="text-slate-600 text-xs text-center mt-4">
          Solo recibirás recordatorios de Vicu. Puedes desactivarlos cuando quieras.
        </p>
      </div>
    </div>
  );
}
