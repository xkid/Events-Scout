export enum Country {
  Thailand = 'Thailand',
  Malaysia = 'Malaysia',
  Singapore = 'Singapore',
  Indonesia = 'Indonesia',
  Philippines = 'Philippines',
  Vietnam = 'Vietnam',
  UAE = 'UAE (Dubai)',
  Germany = 'Germany',
  Australia = 'Australia',
  Europe = 'Europe'
}

export enum Venue {
  // Thailand
  Impact = 'Impact Arena & Exhibition Center',
  Bitec = 'BITEC Bangna',
  Qsncc = 'Queen Sirikit National Convention Center (QSNCC)',
  
  // Malaysia
  Klcc = 'Kuala Lumpur Convention Centre (KLCC)',
  Mitec = 'MITEC',
  Spice = 'Setia SPICE Convention Centre',
  Pwcc = 'Penang Waterfront Convention Centre (PWCC)',
  
  // Singapore
  Expo = 'Singapore EXPO',
  Mbs = 'Marina Bay Sands Convention Centre',

  // Indonesia
  Jcc = 'Jakarta Convention Center',
  Jiexpo = 'Jakarta International Expo (JIExpo)',
  Ice = 'Indonesia Convention Exhibition (ICE BSD)',

  // Philippines
  Smx = 'SMX Convention Center',
  WtcManila = 'World Trade Center Metro Manila',

  // Vietnam
  Secc = 'Saigon Exhibition and Convention Center (SECC)',
  IceHanoi = 'International Centre for Exhibition (I.C.E ) Hanoi',

  // UAE (Dubai)
  Dwtc = 'Dubai World Trade Centre',

  // Germany
  MesseFrankfurt = 'Messe Frankfurt',
  MesseBerlin = 'Messe Berlin',
  MesseMunchen = 'Messe München',
  Koelnmesse = 'Koelnmesse',

  // Australia
  IccSydney = 'ICC Sydney',
  Mcec = 'Melbourne Convention and Exhibition Centre',
  
  // Europe (General major ones)
  FiraBarcelona = 'Fira Barcelona',
  ParisNord = 'Paris Nord Villepinte',
  RaiAmsterdam = 'RAI Amsterdam'
}

export interface CompanyInfo {
  name: string;
  email?: string;
  contact?: string;
  role: 'Organizer' | 'Exhibitor' | 'Partner';
}

export interface EventData {
  id: string; // Unique ID (hash of name + date)
  name: string;
  dateStart: string; // ISO Date string
  dateEnd: string;   // ISO Date string
  venue: Venue;
  country: Country;
  description?: string;
  companies: CompanyInfo[];
  url?: string;
  isNew?: boolean; // Flag for newly discovered events
}

export interface SearchFilters {
  country: Country | 'All';
  venue?: Venue;
}