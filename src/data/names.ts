export const FIRST_NAMES_M = [
  'Marcus', 'David', 'Daniel', 'Carlos', 'Viktor', 'Nathan', 'Tariq', 'Liam',
  'Kenji', 'Gabriel', 'Owen', 'Mateo', 'Julian', 'Raymond', 'Devon', 'Hector',
  'Roman', 'Samuel', 'Adrian', 'Trevor', 'Noah', 'Elias', 'Caleb', 'Dmitri',
];

export const FIRST_NAMES_F = [
  'Elena', 'Maya', 'Sofia', 'Rachel', 'Nadia', 'Claire', 'Hannah', 'Priya',
  'Valerie', 'Camila', 'Naomi', 'Tessa', 'Amara', 'Lauren', 'Chloe', 'Yuki',
  'Mina', 'Sienna', 'Audrey', 'Karina', 'Gabriela', 'Avery', 'Zara', 'Meredith',
];

export const LAST_NAMES = [
  'Vance', 'Moreno', 'Kowalski', 'Chen', 'Al-Mansoor', 'Sullivan', 'Petrov', 'Nakamura',
  'Brooks', 'Delgado', 'Sorensen', 'Patel', 'Mercer', 'Reyes', 'Caldwell', 'Lindqvist',
  'Okafor', 'Benitez', 'Holloway', 'Volkov', 'Keller', 'Vargas', 'Sinclair', 'Bauer',
  'Mendoza', 'Thornton', 'Sato', 'henderson', 'Gallagher', 'Castillo', 'Novak', 'Farrell',
].map((n) => n.charAt(0).toUpperCase() + n.slice(1));

export const AIRLINES = [
  { name: 'PAN-ATLANTIC AIR', code: 'PA' },
  { name: 'NORTHSTAR AIRLINES', code: 'NS' },
  { name: 'PACIFIC HORIZON', code: 'PH' },
  { name: 'MERIDIAN JET', code: 'MJ' },
  { name: 'CRESTLINE AIRWAYS', code: 'CA' },
];

export const DESTINATIONS = [
  { code: 'LHR', city: 'LONDON HEATHROW', gate: 'B14' },
  { code: 'JFK', city: 'NEW YORK JFK', gate: 'B12' },
  { code: 'HND', city: 'TOKYO HANEDA', gate: 'B19' },
  { code: 'CDG', city: 'PARIS DE GAULLE', gate: 'B16' },
  { code: 'ORD', city: 'CHICAGO O’HARE', gate: 'B11' },
  { code: 'DXB', city: 'DUBAI INTL', gate: 'B22' },
  { code: 'FRA', city: 'FRANKFURT', gate: 'B18' },
  { code: 'SFO', city: 'SAN FRANCISCO', gate: 'B15' },
  { code: 'YYZ', city: 'TORONTO PEARSON', gate: 'B13' },
  { code: 'MIA', city: 'MIAMI INTL', gate: 'B17' },
];

export const ISSUING_STATES = [
  'CALIFORNIA', 'NEW YORK', 'TEXAS', 'ILLINOIS', 'WASHINGTON',
  'FLORIDA', 'MASSACHUSETTS', 'COLORADO', 'VIRGINIA', 'OREGON',
];

export const NATIONALITIES = [
  { country: 'UNITED STATES', code: 'USA' },
  { country: 'CANADA', code: 'CAN' },
  { country: 'UNITED KINGDOM', code: 'GBR' },
  { country: 'GERMANY', code: 'DEU' },
  { country: 'JAPAN', code: 'JPN' },
  { country: 'FRANCE', code: 'FRA' },
];

export const NORMAL_GREETINGS = [
  'Morning, officer. Here’s my boarding pass and ID.',
  'Bag’s already on the belt. Hope my flight isn’t delayed.',
  'Here you go—just heading out on a business trip.',
  'Everything should be in order. Laptop’s inside the carry-on.',
  'Busy terminal today, huh? Here’s my passport.',
  'Thanks for keeping things moving. Gate B14, right?',
];

export const NERVOUS_GREETINGS = [
  'Uh, yeah—here’s my ID. Can we make this quick? Boarding closes soon.',
  'Just clothes in the bag. Nothing to worry about.',
  'Why’s the belt moving so slow? Look, I’m going to miss my connection.',
  'Do you really need to check the UV seal? It’s a brand-new ID.',
  'Wait—don’t open the side pocket, it’s just fragile souvenirs.',
];

export const SKIN_TONES = [
  '#f4d3bd', '#e8be9e', '#d69f76', '#b87d56', '#8d5535', '#633a24',
];

export const HAIR_COLORS = [
  '#1b1715', '#3b281e', '#6c492d', '#b88b4a', '#8c3b23', '#9a9fa6',
];

export const JACKET_COLORS = [
  '#232b38', '#33404f', '#4a3a2f', '#283c34', '#5c2c2c',
  '#3e3f45', '#1d242e', '#4d5561', '#6e5a44', '#2c3a4c',
];

export const SHIRT_COLORS = [
  '#dce3ec', '#c9d4e0', '#2b323d', '#8aa0b8', '#d4c6b2', '#3d4f63',
];

export const BAG_COLORS: Array<{ body: string; accent: string }> = [
  { body: '#1f2937', accent: '#64748b' },
  { body: '#2c3d52', accent: '#94a3b8' },
  { body: '#57282b', accent: '#cbd5e1' },
  { body: '#2f3e34', accent: '#a39e89' },
  { body: '#3f3f46', accent: '#d4d4d8' },
  { body: '#5a422f', accent: '#292019' },
];
