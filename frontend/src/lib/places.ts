export type PlaceOption = { code: string; name: string };
export type StateProvinceOption = { code: string; name: string; country: 'US' | 'CA' };
export type CityOption = { name: string; state: string; country: 'US' | 'CA' };

export const COUNTRY_OPTIONS: PlaceOption[] = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'MX', name: 'Mexico' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
  { code: 'SG', name: 'Singapore' },
];

export const STATE_PROVINCE_OPTIONS: StateProvinceOption[] = [
  // US States
  { code: 'AL', name: 'Alabama', country: 'US' },
  { code: 'AK', name: 'Alaska', country: 'US' },
  { code: 'AZ', name: 'Arizona', country: 'US' },
  { code: 'AR', name: 'Arkansas', country: 'US' },
  { code: 'CA', name: 'California', country: 'US' },
  { code: 'CO', name: 'Colorado', country: 'US' },
  { code: 'CT', name: 'Connecticut', country: 'US' },
  { code: 'DE', name: 'Delaware', country: 'US' },
  { code: 'DC', name: 'District of Columbia', country: 'US' },
  { code: 'FL', name: 'Florida', country: 'US' },
  { code: 'GA', name: 'Georgia', country: 'US' },
  { code: 'HI', name: 'Hawaii', country: 'US' },
  { code: 'ID', name: 'Idaho', country: 'US' },
  { code: 'IL', name: 'Illinois', country: 'US' },
  { code: 'IN', name: 'Indiana', country: 'US' },
  { code: 'IA', name: 'Iowa', country: 'US' },
  { code: 'KS', name: 'Kansas', country: 'US' },
  { code: 'KY', name: 'Kentucky', country: 'US' },
  { code: 'LA', name: 'Louisiana', country: 'US' },
  { code: 'ME', name: 'Maine', country: 'US' },
  { code: 'MD', name: 'Maryland', country: 'US' },
  { code: 'MA', name: 'Massachusetts', country: 'US' },
  { code: 'MI', name: 'Michigan', country: 'US' },
  { code: 'MN', name: 'Minnesota', country: 'US' },
  { code: 'MS', name: 'Mississippi', country: 'US' },
  { code: 'MO', name: 'Missouri', country: 'US' },
  { code: 'MT', name: 'Montana', country: 'US' },
  { code: 'NE', name: 'Nebraska', country: 'US' },
  { code: 'NV', name: 'Nevada', country: 'US' },
  { code: 'NH', name: 'New Hampshire', country: 'US' },
  { code: 'NJ', name: 'New Jersey', country: 'US' },
  { code: 'NM', name: 'New Mexico', country: 'US' },
  { code: 'NY', name: 'New York', country: 'US' },
  { code: 'NC', name: 'North Carolina', country: 'US' },
  { code: 'ND', name: 'North Dakota', country: 'US' },
  { code: 'OH', name: 'Ohio', country: 'US' },
  { code: 'OK', name: 'Oklahoma', country: 'US' },
  { code: 'OR', name: 'Oregon', country: 'US' },
  { code: 'PA', name: 'Pennsylvania', country: 'US' },
  { code: 'RI', name: 'Rhode Island', country: 'US' },
  { code: 'SC', name: 'South Carolina', country: 'US' },
  { code: 'SD', name: 'South Dakota', country: 'US' },
  { code: 'TN', name: 'Tennessee', country: 'US' },
  { code: 'TX', name: 'Texas', country: 'US' },
  { code: 'UT', name: 'Utah', country: 'US' },
  { code: 'VT', name: 'Vermont', country: 'US' },
  { code: 'VA', name: 'Virginia', country: 'US' },
  { code: 'WA', name: 'Washington', country: 'US' },
  { code: 'WV', name: 'West Virginia', country: 'US' },
  { code: 'WI', name: 'Wisconsin', country: 'US' },
  { code: 'WY', name: 'Wyoming', country: 'US' },
  // Canadian Provinces
  { code: 'AB', name: 'Alberta', country: 'CA' },
  { code: 'BC', name: 'British Columbia', country: 'CA' },
  { code: 'MB', name: 'Manitoba', country: 'CA' },
  { code: 'NB', name: 'New Brunswick', country: 'CA' },
  { code: 'NL', name: 'Newfoundland and Labrador', country: 'CA' },
  { code: 'NS', name: 'Nova Scotia', country: 'CA' },
  { code: 'NT', name: 'Northwest Territories', country: 'CA' },
  { code: 'NU', name: 'Nunavut', country: 'CA' },
  { code: 'ON', name: 'Ontario', country: 'CA' },
  { code: 'PE', name: 'Prince Edward Island', country: 'CA' },
  { code: 'QC', name: 'Quebec', country: 'CA' },
  { code: 'SK', name: 'Saskatchewan', country: 'CA' },
  { code: 'YT', name: 'Yukon', country: 'CA' },
];

export const CITY_DATA: CityOption[] = [
  // Alabama
  { name: 'Birmingham', state: 'AL', country: 'US' },
  { name: 'Huntsville', state: 'AL', country: 'US' },
  { name: 'Mobile', state: 'AL', country: 'US' },
  { name: 'Montgomery', state: 'AL', country: 'US' },
  { name: 'Tuscaloosa', state: 'AL', country: 'US' },

  // Alaska
  { name: 'Anchorage', state: 'AK', country: 'US' },
  { name: 'Fairbanks', state: 'AK', country: 'US' },
  { name: 'Juneau', state: 'AK', country: 'US' },

  // Arizona
  { name: 'Chandler', state: 'AZ', country: 'US' },
  { name: 'Gilbert', state: 'AZ', country: 'US' },
  { name: 'Glendale', state: 'AZ', country: 'US' },
  { name: 'Mesa', state: 'AZ', country: 'US' },
  { name: 'Phoenix', state: 'AZ', country: 'US' },
  { name: 'Scottsdale', state: 'AZ', country: 'US' },
  { name: 'Tempe', state: 'AZ', country: 'US' },
  { name: 'Tucson', state: 'AZ', country: 'US' },

  // Arkansas
  { name: 'Fayetteville', state: 'AR', country: 'US' },
  { name: 'Fort Smith', state: 'AR', country: 'US' },
  { name: 'Jonesboro', state: 'AR', country: 'US' },
  { name: 'Little Rock', state: 'AR', country: 'US' },
  { name: 'Springdale', state: 'AR', country: 'US' },

  // California
  { name: 'Anaheim', state: 'CA', country: 'US' },
  { name: 'Bakersfield', state: 'CA', country: 'US' },
  { name: 'Fontana', state: 'CA', country: 'US' },
  { name: 'Fresno', state: 'CA', country: 'US' },
  { name: 'Irvine', state: 'CA', country: 'US' },
  { name: 'Long Beach', state: 'CA', country: 'US' },
  { name: 'Los Angeles', state: 'CA', country: 'US' },
  { name: 'Modesto', state: 'CA', country: 'US' },
  { name: 'Oakland', state: 'CA', country: 'US' },
  { name: 'Ontario', state: 'CA', country: 'US' },
  { name: 'Riverside', state: 'CA', country: 'US' },
  { name: 'Sacramento', state: 'CA', country: 'US' },
  { name: 'San Bernardino', state: 'CA', country: 'US' },
  { name: 'San Diego', state: 'CA', country: 'US' },
  { name: 'San Francisco', state: 'CA', country: 'US' },
  { name: 'San Jose', state: 'CA', country: 'US' },
  { name: 'Santa Ana', state: 'CA', country: 'US' },
  { name: 'Stockton', state: 'CA', country: 'US' },

  // Colorado
  { name: 'Aurora', state: 'CO', country: 'US' },
  { name: 'Boulder', state: 'CO', country: 'US' },
  { name: 'Colorado Springs', state: 'CO', country: 'US' },
  { name: 'Denver', state: 'CO', country: 'US' },
  { name: 'Fort Collins', state: 'CO', country: 'US' },
  { name: 'Lakewood', state: 'CO', country: 'US' },

  // Connecticut
  { name: 'Bridgeport', state: 'CT', country: 'US' },
  { name: 'Hartford', state: 'CT', country: 'US' },
  { name: 'New Haven', state: 'CT', country: 'US' },
  { name: 'Stamford', state: 'CT', country: 'US' },
  { name: 'Waterbury', state: 'CT', country: 'US' },

  // Delaware
  { name: 'Dover', state: 'DE', country: 'US' },
  { name: 'Newark', state: 'DE', country: 'US' },
  { name: 'Wilmington', state: 'DE', country: 'US' },

  // District of Columbia
  { name: 'Washington', state: 'DC', country: 'US' },

  // Florida
  { name: 'Cape Coral', state: 'FL', country: 'US' },
  { name: 'Fort Lauderdale', state: 'FL', country: 'US' },
  { name: 'Gainesville', state: 'FL', country: 'US' },
  { name: 'Hialeah', state: 'FL', country: 'US' },
  { name: 'Jacksonville', state: 'FL', country: 'US' },
  { name: 'Miami', state: 'FL', country: 'US' },
  { name: 'Orlando', state: 'FL', country: 'US' },
  { name: 'Port St. Lucie', state: 'FL', country: 'US' },
  { name: 'St. Petersburg', state: 'FL', country: 'US' },
  { name: 'Tallahassee', state: 'FL', country: 'US' },
  { name: 'Tampa', state: 'FL', country: 'US' },

  // Georgia
  { name: 'Athens', state: 'GA', country: 'US' },
  { name: 'Atlanta', state: 'GA', country: 'US' },
  { name: 'Augusta', state: 'GA', country: 'US' },
  { name: 'Columbus', state: 'GA', country: 'US' },
  { name: 'Macon', state: 'GA', country: 'US' },
  { name: 'Savannah', state: 'GA', country: 'US' },

  // Hawaii
  { name: 'Hilo', state: 'HI', country: 'US' },
  { name: 'Honolulu', state: 'HI', country: 'US' },
  { name: 'Kahului', state: 'HI', country: 'US' },

  // Idaho
  { name: 'Boise', state: 'ID', country: 'US' },
  { name: 'Idaho Falls', state: 'ID', country: 'US' },
  { name: 'Meridian', state: 'ID', country: 'US' },
  { name: 'Nampa', state: 'ID', country: 'US' },

  // Illinois
  { name: 'Aurora', state: 'IL', country: 'US' },
  { name: 'Chicago', state: 'IL', country: 'US' },
  { name: 'Elgin', state: 'IL', country: 'US' },
  { name: 'Joliet', state: 'IL', country: 'US' },
  { name: 'Naperville', state: 'IL', country: 'US' },
  { name: 'Peoria', state: 'IL', country: 'US' },
  { name: 'Rockford', state: 'IL', country: 'US' },
  { name: 'Springfield', state: 'IL', country: 'US' },

  // Indiana
  { name: 'Evansville', state: 'IN', country: 'US' },
  { name: 'Fort Wayne', state: 'IN', country: 'US' },
  { name: 'Gary', state: 'IN', country: 'US' },
  { name: 'Indianapolis', state: 'IN', country: 'US' },
  { name: 'South Bend', state: 'IN', country: 'US' },

  // Iowa
  { name: 'Cedar Rapids', state: 'IA', country: 'US' },
  { name: 'Davenport', state: 'IA', country: 'US' },
  { name: 'Des Moines', state: 'IA', country: 'US' },
  { name: 'Sioux City', state: 'IA', country: 'US' },

  // Kansas
  { name: 'Kansas City', state: 'KS', country: 'US' },
  { name: 'Olathe', state: 'KS', country: 'US' },
  { name: 'Overland Park', state: 'KS', country: 'US' },
  { name: 'Topeka', state: 'KS', country: 'US' },
  { name: 'Wichita', state: 'KS', country: 'US' },

  // Kentucky
  { name: 'Bowling Green', state: 'KY', country: 'US' },
  { name: 'Covington', state: 'KY', country: 'US' },
  { name: 'Lexington', state: 'KY', country: 'US' },
  { name: 'Louisville', state: 'KY', country: 'US' },
  { name: 'Owensboro', state: 'KY', country: 'US' },

  // Louisiana
  { name: 'Baton Rouge', state: 'LA', country: 'US' },
  { name: 'Lafayette', state: 'LA', country: 'US' },
  { name: 'Lake Charles', state: 'LA', country: 'US' },
  { name: 'New Orleans', state: 'LA', country: 'US' },
  { name: 'Shreveport', state: 'LA', country: 'US' },

  // Maine
  { name: 'Bangor', state: 'ME', country: 'US' },
  { name: 'Lewiston', state: 'ME', country: 'US' },
  { name: 'Portland', state: 'ME', country: 'US' },

  // Maryland
  { name: 'Annapolis', state: 'MD', country: 'US' },
  { name: 'Baltimore', state: 'MD', country: 'US' },
  { name: 'Frederick', state: 'MD', country: 'US' },
  { name: 'Gaithersburg', state: 'MD', country: 'US' },
  { name: 'Rockville', state: 'MD', country: 'US' },

  // Massachusetts
  { name: 'Boston', state: 'MA', country: 'US' },
  { name: 'Cambridge', state: 'MA', country: 'US' },
  { name: 'Lowell', state: 'MA', country: 'US' },
  { name: 'Springfield', state: 'MA', country: 'US' },
  { name: 'Worcester', state: 'MA', country: 'US' },

  // Michigan
  { name: 'Ann Arbor', state: 'MI', country: 'US' },
  { name: 'Detroit', state: 'MI', country: 'US' },
  { name: 'Flint', state: 'MI', country: 'US' },
  { name: 'Grand Rapids', state: 'MI', country: 'US' },
  { name: 'Lansing', state: 'MI', country: 'US' },
  { name: 'Warren', state: 'MI', country: 'US' },

  // Minnesota
  { name: 'Bloomington', state: 'MN', country: 'US' },
  { name: 'Duluth', state: 'MN', country: 'US' },
  { name: 'Minneapolis', state: 'MN', country: 'US' },
  { name: 'Rochester', state: 'MN', country: 'US' },
  { name: 'St. Paul', state: 'MN', country: 'US' },

  // Mississippi
  { name: 'Biloxi', state: 'MS', country: 'US' },
  { name: 'Gulfport', state: 'MS', country: 'US' },
  { name: 'Hattiesburg', state: 'MS', country: 'US' },
  { name: 'Jackson', state: 'MS', country: 'US' },
  { name: 'Southaven', state: 'MS', country: 'US' },

  // Missouri
  { name: 'Columbia', state: 'MO', country: 'US' },
  { name: 'Independence', state: 'MO', country: 'US' },
  { name: 'Kansas City', state: 'MO', country: 'US' },
  { name: 'Springfield', state: 'MO', country: 'US' },
  { name: 'St. Louis', state: 'MO', country: 'US' },

  // Montana
  { name: 'Billings', state: 'MT', country: 'US' },
  { name: 'Bozeman', state: 'MT', country: 'US' },
  { name: 'Great Falls', state: 'MT', country: 'US' },
  { name: 'Helena', state: 'MT', country: 'US' },
  { name: 'Missoula', state: 'MT', country: 'US' },

  // Nebraska
  { name: 'Grand Island', state: 'NE', country: 'US' },
  { name: 'Lincoln', state: 'NE', country: 'US' },
  { name: 'Omaha', state: 'NE', country: 'US' },

  // Nevada
  { name: 'Carson City', state: 'NV', country: 'US' },
  { name: 'Henderson', state: 'NV', country: 'US' },
  { name: 'Las Vegas', state: 'NV', country: 'US' },
  { name: 'North Las Vegas', state: 'NV', country: 'US' },
  { name: 'Reno', state: 'NV', country: 'US' },
  { name: 'Sparks', state: 'NV', country: 'US' },

  // New Hampshire
  { name: 'Concord', state: 'NH', country: 'US' },
  { name: 'Manchester', state: 'NH', country: 'US' },
  { name: 'Nashua', state: 'NH', country: 'US' },

  // New Jersey
  { name: 'Camden', state: 'NJ', country: 'US' },
  { name: 'Edison', state: 'NJ', country: 'US' },
  { name: 'Elizabeth', state: 'NJ', country: 'US' },
  { name: 'Jersey City', state: 'NJ', country: 'US' },
  { name: 'Newark', state: 'NJ', country: 'US' },
  { name: 'Paterson', state: 'NJ', country: 'US' },
  { name: 'Trenton', state: 'NJ', country: 'US' },

  // New Mexico
  { name: 'Albuquerque', state: 'NM', country: 'US' },
  { name: 'Las Cruces', state: 'NM', country: 'US' },
  { name: 'Rio Rancho', state: 'NM', country: 'US' },
  { name: 'Santa Fe', state: 'NM', country: 'US' },

  // New York
  { name: 'Albany', state: 'NY', country: 'US' },
  { name: 'Buffalo', state: 'NY', country: 'US' },
  { name: 'New York', state: 'NY', country: 'US' },
  { name: 'Rochester', state: 'NY', country: 'US' },
  { name: 'Syracuse', state: 'NY', country: 'US' },
  { name: 'Yonkers', state: 'NY', country: 'US' },

  // North Carolina
  { name: 'Cary', state: 'NC', country: 'US' },
  { name: 'Charlotte', state: 'NC', country: 'US' },
  { name: 'Durham', state: 'NC', country: 'US' },
  { name: 'Fayetteville', state: 'NC', country: 'US' },
  { name: 'Greensboro', state: 'NC', country: 'US' },
  { name: 'Raleigh', state: 'NC', country: 'US' },
  { name: 'Wilmington', state: 'NC', country: 'US' },
  { name: 'Winston-Salem', state: 'NC', country: 'US' },

  // North Dakota
  { name: 'Bismarck', state: 'ND', country: 'US' },
  { name: 'Fargo', state: 'ND', country: 'US' },
  { name: 'Grand Forks', state: 'ND', country: 'US' },
  { name: 'Minot', state: 'ND', country: 'US' },

  // Ohio
  { name: 'Akron', state: 'OH', country: 'US' },
  { name: 'Cincinnati', state: 'OH', country: 'US' },
  { name: 'Cleveland', state: 'OH', country: 'US' },
  { name: 'Columbus', state: 'OH', country: 'US' },
  { name: 'Dayton', state: 'OH', country: 'US' },
  { name: 'Toledo', state: 'OH', country: 'US' },

  // Oklahoma
  { name: 'Broken Arrow', state: 'OK', country: 'US' },
  { name: 'Edmond', state: 'OK', country: 'US' },
  { name: 'Norman', state: 'OK', country: 'US' },
  { name: 'Oklahoma City', state: 'OK', country: 'US' },
  { name: 'Tulsa', state: 'OK', country: 'US' },

  // Oregon
  { name: 'Beaverton', state: 'OR', country: 'US' },
  { name: 'Bend', state: 'OR', country: 'US' },
  { name: 'Eugene', state: 'OR', country: 'US' },
  { name: 'Gresham', state: 'OR', country: 'US' },
  { name: 'Hillsboro', state: 'OR', country: 'US' },
  { name: 'Portland', state: 'OR', country: 'US' },
  { name: 'Salem', state: 'OR', country: 'US' },

  // Pennsylvania
  { name: 'Allentown', state: 'PA', country: 'US' },
  { name: 'Erie', state: 'PA', country: 'US' },
  { name: 'Harrisburg', state: 'PA', country: 'US' },
  { name: 'Philadelphia', state: 'PA', country: 'US' },
  { name: 'Pittsburgh', state: 'PA', country: 'US' },
  { name: 'Reading', state: 'PA', country: 'US' },
  { name: 'Scranton', state: 'PA', country: 'US' },

  // Rhode Island
  { name: 'Cranston', state: 'RI', country: 'US' },
  { name: 'Pawtucket', state: 'RI', country: 'US' },
  { name: 'Providence', state: 'RI', country: 'US' },
  { name: 'Warwick', state: 'RI', country: 'US' },

  // South Carolina
  { name: 'Charleston', state: 'SC', country: 'US' },
  { name: 'Columbia', state: 'SC', country: 'US' },
  { name: 'Greenville', state: 'SC', country: 'US' },
  { name: 'Mount Pleasant', state: 'SC', country: 'US' },
  { name: 'North Charleston', state: 'SC', country: 'US' },
  { name: 'Rock Hill', state: 'SC', country: 'US' },

  // South Dakota
  { name: 'Aberdeen', state: 'SD', country: 'US' },
  { name: 'Rapid City', state: 'SD', country: 'US' },
  { name: 'Sioux Falls', state: 'SD', country: 'US' },

  // Tennessee
  { name: 'Chattanooga', state: 'TN', country: 'US' },
  { name: 'Clarksville', state: 'TN', country: 'US' },
  { name: 'Knoxville', state: 'TN', country: 'US' },
  { name: 'Memphis', state: 'TN', country: 'US' },
  { name: 'Murfreesboro', state: 'TN', country: 'US' },
  { name: 'Nashville', state: 'TN', country: 'US' },

  // Texas
  { name: 'Amarillo', state: 'TX', country: 'US' },
  { name: 'Arlington', state: 'TX', country: 'US' },
  { name: 'Austin', state: 'TX', country: 'US' },
  { name: 'Beaumont', state: 'TX', country: 'US' },
  { name: 'Brownsville', state: 'TX', country: 'US' },
  { name: 'Corpus Christi', state: 'TX', country: 'US' },
  { name: 'Dallas', state: 'TX', country: 'US' },
  { name: 'El Paso', state: 'TX', country: 'US' },
  { name: 'Fort Worth', state: 'TX', country: 'US' },
  { name: 'Frisco', state: 'TX', country: 'US' },
  { name: 'Garland', state: 'TX', country: 'US' },
  { name: 'Grand Prairie', state: 'TX', country: 'US' },
  { name: 'Houston', state: 'TX', country: 'US' },
  { name: 'Irving', state: 'TX', country: 'US' },
  { name: 'Laredo', state: 'TX', country: 'US' },
  { name: 'Lubbock', state: 'TX', country: 'US' },
  { name: 'McKinney', state: 'TX', country: 'US' },
  { name: 'Pasadena', state: 'TX', country: 'US' },
  { name: 'Plano', state: 'TX', country: 'US' },
  { name: 'San Antonio', state: 'TX', country: 'US' },

  // Utah
  { name: 'Ogden', state: 'UT', country: 'US' },
  { name: 'Orem', state: 'UT', country: 'US' },
  { name: 'Provo', state: 'UT', country: 'US' },
  { name: 'Salt Lake City', state: 'UT', country: 'US' },
  { name: 'Sandy', state: 'UT', country: 'US' },
  { name: 'St. George', state: 'UT', country: 'US' },
  { name: 'West Jordan', state: 'UT', country: 'US' },
  { name: 'West Valley City', state: 'UT', country: 'US' },

  // Vermont
  { name: 'Barre', state: 'VT', country: 'US' },
  { name: 'Burlington', state: 'VT', country: 'US' },
  { name: 'Rutland', state: 'VT', country: 'US' },
  { name: 'South Burlington', state: 'VT', country: 'US' },

  // Virginia
  { name: 'Alexandria', state: 'VA', country: 'US' },
  { name: 'Chesapeake', state: 'VA', country: 'US' },
  { name: 'Hampton', state: 'VA', country: 'US' },
  { name: 'Newport News', state: 'VA', country: 'US' },
  { name: 'Norfolk', state: 'VA', country: 'US' },
  { name: 'Richmond', state: 'VA', country: 'US' },
  { name: 'Roanoke', state: 'VA', country: 'US' },
  { name: 'Virginia Beach', state: 'VA', country: 'US' },

  // Washington
  { name: 'Bellevue', state: 'WA', country: 'US' },
  { name: 'Everett', state: 'WA', country: 'US' },
  { name: 'Kent', state: 'WA', country: 'US' },
  { name: 'Renton', state: 'WA', country: 'US' },
  { name: 'Seattle', state: 'WA', country: 'US' },
  { name: 'Spokane', state: 'WA', country: 'US' },
  { name: 'Tacoma', state: 'WA', country: 'US' },
  { name: 'Vancouver', state: 'WA', country: 'US' },

  // West Virginia
  { name: 'Charleston', state: 'WV', country: 'US' },
  { name: 'Huntington', state: 'WV', country: 'US' },
  { name: 'Morgantown', state: 'WV', country: 'US' },
  { name: 'Parkersburg', state: 'WV', country: 'US' },

  // Wisconsin
  { name: 'Appleton', state: 'WI', country: 'US' },
  { name: 'Green Bay', state: 'WI', country: 'US' },
  { name: 'Kenosha', state: 'WI', country: 'US' },
  { name: 'Madison', state: 'WI', country: 'US' },
  { name: 'Milwaukee', state: 'WI', country: 'US' },
  { name: 'Oshkosh', state: 'WI', country: 'US' },
  { name: 'Racine', state: 'WI', country: 'US' },
  { name: 'Waukesha', state: 'WI', country: 'US' },

  // Wyoming
  { name: 'Casper', state: 'WY', country: 'US' },
  { name: 'Cheyenne', state: 'WY', country: 'US' },
  { name: 'Gillette', state: 'WY', country: 'US' },
  { name: 'Laramie', state: 'WY', country: 'US' },

  // Alberta
  { name: 'Airdrie', state: 'AB', country: 'CA' },
  { name: 'Calgary', state: 'AB', country: 'CA' },
  { name: 'Edmonton', state: 'AB', country: 'CA' },
  { name: 'Grande Prairie', state: 'AB', country: 'CA' },
  { name: 'Lethbridge', state: 'AB', country: 'CA' },
  { name: 'Medicine Hat', state: 'AB', country: 'CA' },
  { name: 'Red Deer', state: 'AB', country: 'CA' },
  { name: 'St. Albert', state: 'AB', country: 'CA' },

  // British Columbia
  { name: 'Abbotsford', state: 'BC', country: 'CA' },
  { name: 'Burnaby', state: 'BC', country: 'CA' },
  { name: 'Chilliwack', state: 'BC', country: 'CA' },
  { name: 'Coquitlam', state: 'BC', country: 'CA' },
  { name: 'Delta', state: 'BC', country: 'CA' },
  { name: 'Kamloops', state: 'BC', country: 'CA' },
  { name: 'Kelowna', state: 'BC', country: 'CA' },
  { name: 'Langley', state: 'BC', country: 'CA' },
  { name: 'Nanaimo', state: 'BC', country: 'CA' },
  { name: 'Prince George', state: 'BC', country: 'CA' },
  { name: 'Richmond', state: 'BC', country: 'CA' },
  { name: 'Saanich', state: 'BC', country: 'CA' },
  { name: 'Surrey', state: 'BC', country: 'CA' },
  { name: 'Vancouver', state: 'BC', country: 'CA' },
  { name: 'Victoria', state: 'BC', country: 'CA' },

  // Manitoba
  { name: 'Brandon', state: 'MB', country: 'CA' },
  { name: 'Steinbach', state: 'MB', country: 'CA' },
  { name: 'Winnipeg', state: 'MB', country: 'CA' },

  // New Brunswick
  { name: 'Fredericton', state: 'NB', country: 'CA' },
  { name: 'Moncton', state: 'NB', country: 'CA' },
  { name: 'Saint John', state: 'NB', country: 'CA' },

  // Newfoundland and Labrador
  { name: 'Corner Brook', state: 'NL', country: 'CA' },
  { name: 'Mount Pearl', state: 'NL', country: 'CA' },
  { name: 'St. John\'s', state: 'NL', country: 'CA' },

  // Nova Scotia
  { name: 'Dartmouth', state: 'NS', country: 'CA' },
  { name: 'Halifax', state: 'NS', country: 'CA' },
  { name: 'Sydney', state: 'NS', country: 'CA' },

  // Northwest Territories
  { name: 'Yellowknife', state: 'NT', country: 'CA' },

  // Nunavut
  { name: 'Iqaluit', state: 'NU', country: 'CA' },

  // Ontario
  { name: 'Barrie', state: 'ON', country: 'CA' },
  { name: 'Brampton', state: 'ON', country: 'CA' },
  { name: 'Brantford', state: 'ON', country: 'CA' },
  { name: 'Burlington', state: 'ON', country: 'CA' },
  { name: 'Cambridge', state: 'ON', country: 'CA' },
  { name: 'Guelph', state: 'ON', country: 'CA' },
  { name: 'Hamilton', state: 'ON', country: 'CA' },
  { name: 'Kingston', state: 'ON', country: 'CA' },
  { name: 'Kitchener', state: 'ON', country: 'CA' },
  { name: 'London', state: 'ON', country: 'CA' },
  { name: 'Markham', state: 'ON', country: 'CA' },
  { name: 'Mississauga', state: 'ON', country: 'CA' },
  { name: 'Oakville', state: 'ON', country: 'CA' },
  { name: 'Oshawa', state: 'ON', country: 'CA' },
  { name: 'Ottawa', state: 'ON', country: 'CA' },
  { name: 'Richmond Hill', state: 'ON', country: 'CA' },
  { name: 'Sudbury', state: 'ON', country: 'CA' },
  { name: 'Thunder Bay', state: 'ON', country: 'CA' },
  { name: 'Toronto', state: 'ON', country: 'CA' },
  { name: 'Vaughan', state: 'ON', country: 'CA' },
  { name: 'Waterloo', state: 'ON', country: 'CA' },
  { name: 'Windsor', state: 'ON', country: 'CA' },

  // Prince Edward Island
  { name: 'Charlottetown', state: 'PE', country: 'CA' },
  { name: 'Summerside', state: 'PE', country: 'CA' },

  // Quebec
  { name: 'Gatineau', state: 'QC', country: 'CA' },
  { name: 'Laval', state: 'QC', country: 'CA' },
  { name: 'Levis', state: 'QC', country: 'CA' },
  { name: 'Longueuil', state: 'QC', country: 'CA' },
  { name: 'Montreal', state: 'QC', country: 'CA' },
  { name: 'Quebec City', state: 'QC', country: 'CA' },
  { name: 'Saguenay', state: 'QC', country: 'CA' },
  { name: 'Sherbrooke', state: 'QC', country: 'CA' },
  { name: 'Trois-Rivieres', state: 'QC', country: 'CA' },

  // Saskatchewan
  { name: 'Moose Jaw', state: 'SK', country: 'CA' },
  { name: 'Prince Albert', state: 'SK', country: 'CA' },
  { name: 'Regina', state: 'SK', country: 'CA' },
  { name: 'Saskatoon', state: 'SK', country: 'CA' },

  // Yukon
  { name: 'Whitehorse', state: 'YT', country: 'CA' },
];

export const COMMON_CITIES: string[] = Array.from(new Set(CITY_DATA.map(c => c.name))).sort();

/**
 * Normalizes country to standard uppercase abbreviation (e.g. "United States" -> "US", "Canada" -> "CA").
 */
export const formatCountryAbbr = (value: unknown): string => {
  if (!value) return '';
  const str = String(value).trim();
  if (!str || str === '—' || str === '-') return str;

  const upper = str.toUpperCase().replace(/\./g, '');
  if (['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA', 'AMERICA'].includes(upper)) {
    return 'US';
  }
  if (['CA', 'CAN', 'CANADA'].includes(upper)) {
    return 'CA';
  }
  if (['MX', 'MEX', 'MEXICO'].includes(upper)) {
    return 'MX';
  }
  if (['UK', 'GB', 'UNITED KINGDOM', 'GREAT BRITAIN', 'ENGLAND'].includes(upper)) {
    return 'UK';
  }

  const match = COUNTRY_OPTIONS.find(
    c => c.code.toUpperCase() === upper || c.name.toUpperCase() === upper
  );
  if (match) return match.code;

  return str.length <= 3 ? upper : str;
};

/**
 * Normalizes state/province to standard 2-letter uppercase postal abbreviation.
 * (e.g. "Texas" -> "TX", "california" -> "CA", "Ontario" -> "ON").
 */
export const formatStateAbbr = (value: unknown): string => {
  if (!value) return '';
  const str = String(value).trim();
  if (!str || str === '—' || str === '-') return str;

  const upper = str.toUpperCase().replace(/\./g, '');
  const codeMatch = STATE_PROVINCE_OPTIONS.find(s => s.code === upper);
  if (codeMatch) return codeMatch.code;

  const nameMatch = STATE_PROVINCE_OPTIONS.find(s => s.name.toUpperCase() === upper);
  if (nameMatch) return nameMatch.code;

  return str.length === 2 ? upper : str;
};

/**
 * Normalizes city to Title Case (e.g. "houston" -> "Houston", "LOS ANGELES" -> "Los Angeles").
 */
export const formatCityTitleCase = (value: unknown): string => {
  if (!value) return '';
  const str = String(value).trim();
  if (!str || str === '—' || str === '-') return str;

  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
};

/**
 * Returns states/provinces matching the selected country.
 * If country is empty or not US/CA, returns all STATE_PROVINCE_OPTIONS.
 */
export const getStatesForCountry = (countryCode?: unknown): StateProvinceOption[] => {
  const norm = formatCountryAbbr(countryCode);
  if (norm === 'US' || norm === 'CA') {
    return STATE_PROVINCE_OPTIONS.filter(s => s.country === norm);
  }
  return STATE_PROVINCE_OPTIONS;
};

/**
 * Returns country code ('US' | 'CA') for a given state abbreviation or name, if known.
 */
export const getCountryForState = (stateCode?: unknown): 'US' | 'CA' | undefined => {
  const norm = formatStateAbbr(stateCode);
  const match = STATE_PROVINCE_OPTIONS.find(s => s.code === norm);
  return match?.country;
};

/**
 * Returns list of city names narrowed down to the selected state/province.
 */
export const getCitiesForState = (stateCode?: unknown): string[] => {
  const norm = formatStateAbbr(stateCode);
  if (!norm) return COMMON_CITIES;
  const filtered = CITY_DATA.filter(c => c.state === norm);
  return filtered.length ? Array.from(new Set(filtered.map(c => c.name))).sort() : COMMON_CITIES;
};

/**
 * Returns list of city names in the given country.
 */
export const getCitiesForCountry = (countryCode?: unknown): string[] => {
  const norm = formatCountryAbbr(countryCode);
  if (!norm) return COMMON_CITIES;
  const filtered = CITY_DATA.filter(c => c.country === norm);
  return filtered.length ? Array.from(new Set(filtered.map(c => c.name))).sort() : COMMON_CITIES;
};

/**
 * Looks up a city by name.
 * If preferredState is supplied, prioritizes the city located in that state.
 * Returns the matching CityOption ({ name, state, country }) or undefined.
 */
export const lookupCity = (cityName?: unknown, preferredState?: unknown): CityOption | undefined => {
  if (!cityName) return undefined;
  const raw = String(cityName).trim().toLowerCase();
  if (!raw) return undefined;

  const pref = formatStateAbbr(preferredState);

  // 1. If preferred state is given, try matching city in that state
  if (pref) {
    const matchInState = CITY_DATA.find(c => c.name.toLowerCase() === raw && c.state === pref);
    if (matchInState) return matchInState;
  }

  // 2. Otherwise find the first matching city
  return CITY_DATA.find(c => c.name.toLowerCase() === raw);
};

export interface PlaceSuggestItem {
  value: string;
  label: string;
  sublabel?: string;
}

export const getCountrySuggestOptions = (): PlaceSuggestItem[] => {
  return COUNTRY_OPTIONS.map(c => ({
    value: c.code,
    label: `${c.code} — ${c.name}`,
    sublabel: c.code,
  }));
};

export const getStateSuggestOptions = (countryCode?: unknown): PlaceSuggestItem[] => {
  return getStatesForCountry(countryCode).map(s => ({
    value: s.code,
    label: `${s.code} — ${s.name}`,
    sublabel: s.country,
  }));
};

export const getCitySuggestOptions = (stateCode?: unknown, countryCode?: unknown): PlaceSuggestItem[] => {
  const normState = formatStateAbbr(stateCode);
  const normCountry = formatCountryAbbr(countryCode);

  if (normState) {
    const citiesInState = CITY_DATA.filter(c => c.state === normState);
    return citiesInState.map(c => ({
      value: c.name,
      label: c.name,
      sublabel: `${c.state}, ${c.country}`,
    }));
  }

  if (normCountry) {
    const citiesInCountry = CITY_DATA.filter(c => c.country === normCountry);
    return citiesInCountry.map(c => ({
      value: c.name,
      label: c.name,
      sublabel: `${c.state}, ${c.country}`,
    }));
  }

  return CITY_DATA.map(c => ({
    value: c.name,
    label: c.name,
    sublabel: `${c.state}, ${c.country}`,
  }));
};
