export interface CountryCode {
  code: string;
  country: string;
  flag: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: "+51", country: "Perú", flag: "🇵🇪" },
  { code: "+52", country: "México", flag: "🇲🇽" },
  { code: "+57", country: "Colombia", flag: "🇨🇴" },
  { code: "+54", country: "Argentina", flag: "🇦🇷" },
  { code: "+56", country: "Chile", flag: "🇨🇱" },
  { code: "+593", country: "Ecuador", flag: "🇪🇨" },
  { code: "+58", country: "Venezuela", flag: "🇻🇪" },
  { code: "+591", country: "Bolivia", flag: "🇧🇴" },
  { code: "+595", country: "Paraguay", flag: "🇵🇾" },
  { code: "+598", country: "Uruguay", flag: "🇺🇾" },
  { code: "+507", country: "Panamá", flag: "🇵🇦" },
  { code: "+506", country: "Costa Rica", flag: "🇨🇷" },
  { code: "+502", country: "Guatemala", flag: "🇬🇹" },
  { code: "+503", country: "El Salvador", flag: "🇸🇻" },
  { code: "+504", country: "Honduras", flag: "🇭🇳" },
  { code: "+505", country: "Nicaragua", flag: "🇳🇮" },
  { code: "+1809", country: "República Dominicana", flag: "🇩🇴" },
  { code: "+1787", country: "Puerto Rico", flag: "🇵🇷" },
  { code: "+34", country: "España", flag: "🇪🇸" },
  { code: "+1", country: "Estados Unidos", flag: "🇺🇸" },
  { code: "+55", country: "Brasil", flag: "🇧🇷" },
  { code: "+44", country: "Reino Unido", flag: "🇬🇧" },
  { code: "+33", country: "Francia", flag: "🇫🇷" },
  { code: "+49", country: "Alemania", flag: "🇩🇪" },
  { code: "+39", country: "Italia", flag: "🇮🇹" },
  { code: "+351", country: "Portugal", flag: "🇵🇹" },
];

export const DEFAULT_COUNTRY_CODE = "+51";

export function getCountryByCode(code: string): CountryCode | undefined {
  return COUNTRY_CODES.find((c) => c.code === code);
}

export function formatPhoneWithCountry(countryCode: string, phone: string): string {
  const cleanPhone = phone.replace(/\D/g, "");
  const cleanCode = countryCode.replace("+", "");
  return cleanCode + cleanPhone;
}
