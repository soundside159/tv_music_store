// UK withholding tax on royalties paid to composers living abroad.
// PURE DATA, used by the signing form (src/components/ComposerAgreement.tsx)
// and the server (functions/api/composer/agreement.ts).
//
// Rates = the maximum UK withholding on COPYRIGHT royalties (music) under the
// UK double taxation treaty with each country, checked on gov.uk HMRC
// "Treaty summary" pages / treaty texts on 2026-11-02. Values in percent.
// GB = UK resident: nothing withheld. A country NOT in this table falls back
// to the UK basic rate (20%) until checked; the admin can override any
// composer's rate in Admin -> Users -> Sync / Cue Sheet Info.
// Notes: Ukraine 5% since 2020 (2017 protocol); Russia, Belarus, Brazil = no
// treaty in effect (20%); Philippines treaty cap 25% is above UK 20% -> 20%;
// Greece 0% only if the composer is taxed on it at home.

export const UK_BASIC_RATE_PERCENT = 20;

export const TREATY_ROYALTY_PERCENT: Record<string, number> = {
  "GB": 0,
  "PL": 5,
  "UA": 5,
  "US": 0,
  "CA": 0,
  "DE": 0,
  "FR": 0,
  "ES": 0,
  "IT": 8,
  "NL": 0,
  "IE": 0,
  "PT": 5,
  "CZ": 0,
  "SK": 0,
  "HU": 0,
  "RO": 3,
  "BG": 5,
  "LT": 0,
  "LV": 10,
  "EE": 0,
  "SE": 0,
  "NO": 0,
  "DK": 0,
  "FI": 0,
  "BE": 0,
  "AT": 0,
  "CH": 0,
  "GR": 0,
  "HR": 5,
  "RS": 10,
  "GE": 0,
  "MD": 5,
  "KZ": 10,
  "IL": 0,
  "TR": 10,
  "AU": 5,
  "NZ": 10,
  "JP": 0,
  "KR": 10,
  "IN": 15,
  "BR": 20,
  "MX": 10,
  "AR": 5,
  "ZA": 0,
  "RU": 20,
  "BY": 20,
  "AM": 5,
  "AZ": 5,
  "CY": 0,
  "MT": 10,
  "SI": 5,
  "LU": 0,
  "IS": 0,
  "PH": 20,
  "ID": 15,
  "TH": 5,
  "VN": 10,
  "CN": 10,
  "SG": 8,
  "AE": 0
};

/** [ISO 3166-1 alpha-2, English name], sorted by name. */
export const COUNTRIES: [string, string][] = [["AF", "Afghanistan"], ["AL", "Albania"], ["DZ", "Algeria"], ["AS", "American Samoa"], ["AD", "Andorra"], ["AO", "Angola"], ["AI", "Anguilla"], ["AQ", "Antarctica"], ["AG", "Antigua and Barbuda"], ["AR", "Argentina"], ["AM", "Armenia"], ["AW", "Aruba"], ["AU", "Australia"], ["AT", "Austria"], ["AZ", "Azerbaijan"], ["BS", "Bahamas"], ["BH", "Bahrain"], ["BD", "Bangladesh"], ["BB", "Barbados"], ["BY", "Belarus"], ["BE", "Belgium"], ["BZ", "Belize"], ["BJ", "Benin"], ["BM", "Bermuda"], ["BT", "Bhutan"], ["BO", "Bolivia"], ["BQ", "Bonaire, Sint Eustatius and Saba"], ["BA", "Bosnia and Herzegovina"], ["BW", "Botswana"], ["BV", "Bouvet Island"], ["BR", "Brazil"], ["IO", "British Indian Ocean Territory"], ["BN", "Brunei Darussalam"], ["BG", "Bulgaria"], ["BF", "Burkina Faso"], ["BI", "Burundi"], ["CV", "Cabo Verde"], ["KH", "Cambodia"], ["CM", "Cameroon"], ["CA", "Canada"], ["KY", "Cayman Islands"], ["CF", "Central African Republic"], ["TD", "Chad"], ["CL", "Chile"], ["CN", "China"], ["CX", "Christmas Island"], ["CC", "Cocos (Keeling) Islands"], ["CO", "Colombia"], ["KM", "Comoros"], ["CG", "Congo"], ["CD", "Congo, The Democratic Republic of the"], ["CK", "Cook Islands"], ["CR", "Costa Rica"], ["HR", "Croatia"], ["CU", "Cuba"], ["CW", "Curaçao"], ["CY", "Cyprus"], ["CZ", "Czechia"], ["CI", "Côte d'Ivoire"], ["DK", "Denmark"], ["DJ", "Djibouti"], ["DM", "Dominica"], ["DO", "Dominican Republic"], ["EC", "Ecuador"], ["EG", "Egypt"], ["SV", "El Salvador"], ["GQ", "Equatorial Guinea"], ["ER", "Eritrea"], ["EE", "Estonia"], ["SZ", "Eswatini"], ["ET", "Ethiopia"], ["FK", "Falkland Islands (Malvinas)"], ["FO", "Faroe Islands"], ["FJ", "Fiji"], ["FI", "Finland"], ["FR", "France"], ["GF", "French Guiana"], ["PF", "French Polynesia"], ["TF", "French Southern Territories"], ["GA", "Gabon"], ["GM", "Gambia"], ["GE", "Georgia"], ["DE", "Germany"], ["GH", "Ghana"], ["GI", "Gibraltar"], ["GR", "Greece"], ["GL", "Greenland"], ["GD", "Grenada"], ["GP", "Guadeloupe"], ["GU", "Guam"], ["GT", "Guatemala"], ["GG", "Guernsey"], ["GN", "Guinea"], ["GW", "Guinea-Bissau"], ["GY", "Guyana"], ["HT", "Haiti"], ["HM", "Heard Island and McDonald Islands"], ["VA", "Holy See (Vatican City State)"], ["HN", "Honduras"], ["HK", "Hong Kong"], ["HU", "Hungary"], ["IS", "Iceland"], ["IN", "India"], ["ID", "Indonesia"], ["IR", "Iran"], ["IQ", "Iraq"], ["IE", "Ireland"], ["IM", "Isle of Man"], ["IL", "Israel"], ["IT", "Italy"], ["JM", "Jamaica"], ["JP", "Japan"], ["JE", "Jersey"], ["JO", "Jordan"], ["KZ", "Kazakhstan"], ["KE", "Kenya"], ["KI", "Kiribati"], ["KW", "Kuwait"], ["KG", "Kyrgyzstan"], ["LA", "Laos"], ["LV", "Latvia"], ["LB", "Lebanon"], ["LS", "Lesotho"], ["LR", "Liberia"], ["LY", "Libya"], ["LI", "Liechtenstein"], ["LT", "Lithuania"], ["LU", "Luxembourg"], ["MO", "Macao"], ["MG", "Madagascar"], ["MW", "Malawi"], ["MY", "Malaysia"], ["MV", "Maldives"], ["ML", "Mali"], ["MT", "Malta"], ["MH", "Marshall Islands"], ["MQ", "Martinique"], ["MR", "Mauritania"], ["MU", "Mauritius"], ["YT", "Mayotte"], ["MX", "Mexico"], ["FM", "Micronesia, Federated States of"], ["MD", "Moldova"], ["MC", "Monaco"], ["MN", "Mongolia"], ["ME", "Montenegro"], ["MS", "Montserrat"], ["MA", "Morocco"], ["MZ", "Mozambique"], ["MM", "Myanmar"], ["NA", "Namibia"], ["NR", "Nauru"], ["NP", "Nepal"], ["NL", "Netherlands"], ["NC", "New Caledonia"], ["NZ", "New Zealand"], ["NI", "Nicaragua"], ["NE", "Niger"], ["NG", "Nigeria"], ["NU", "Niue"], ["NF", "Norfolk Island"], ["KP", "North Korea"], ["MK", "North Macedonia"], ["MP", "Northern Mariana Islands"], ["NO", "Norway"], ["OM", "Oman"], ["PK", "Pakistan"], ["PW", "Palau"], ["PS", "Palestine, State of"], ["PA", "Panama"], ["PG", "Papua New Guinea"], ["PY", "Paraguay"], ["PE", "Peru"], ["PH", "Philippines"], ["PN", "Pitcairn"], ["PL", "Poland"], ["PT", "Portugal"], ["PR", "Puerto Rico"], ["QA", "Qatar"], ["RO", "Romania"], ["RU", "Russian Federation"], ["RW", "Rwanda"], ["RE", "Réunion"], ["BL", "Saint Barthélemy"], ["SH", "Saint Helena, Ascension and Tristan da Cunha"], ["KN", "Saint Kitts and Nevis"], ["LC", "Saint Lucia"], ["MF", "Saint Martin (French part)"], ["PM", "Saint Pierre and Miquelon"], ["VC", "Saint Vincent and the Grenadines"], ["WS", "Samoa"], ["SM", "San Marino"], ["ST", "Sao Tome and Principe"], ["SA", "Saudi Arabia"], ["SN", "Senegal"], ["RS", "Serbia"], ["SC", "Seychelles"], ["SL", "Sierra Leone"], ["SG", "Singapore"], ["SX", "Sint Maarten (Dutch part)"], ["SK", "Slovakia"], ["SI", "Slovenia"], ["SB", "Solomon Islands"], ["SO", "Somalia"], ["ZA", "South Africa"], ["GS", "South Georgia and the South Sandwich Islands"], ["KR", "South Korea"], ["SS", "South Sudan"], ["ES", "Spain"], ["LK", "Sri Lanka"], ["SD", "Sudan"], ["SR", "Suriname"], ["SJ", "Svalbard and Jan Mayen"], ["SE", "Sweden"], ["CH", "Switzerland"], ["SY", "Syria"], ["TW", "Taiwan"], ["TJ", "Tajikistan"], ["TZ", "Tanzania"], ["TH", "Thailand"], ["TL", "Timor-Leste"], ["TG", "Togo"], ["TK", "Tokelau"], ["TO", "Tonga"], ["TT", "Trinidad and Tobago"], ["TN", "Tunisia"], ["TM", "Turkmenistan"], ["TC", "Turks and Caicos Islands"], ["TV", "Tuvalu"], ["TR", "Türkiye"], ["UG", "Uganda"], ["UA", "Ukraine"], ["AE", "United Arab Emirates"], ["GB", "United Kingdom"], ["US", "United States"], ["UM", "United States Minor Outlying Islands"], ["UY", "Uruguay"], ["UZ", "Uzbekistan"], ["VU", "Vanuatu"], ["VE", "Venezuela"], ["VN", "Vietnam"], ["VG", "Virgin Islands, British"], ["VI", "Virgin Islands, U.S."], ["WF", "Wallis and Futuna"], ["EH", "Western Sahara"], ["YE", "Yemen"], ["ZM", "Zambia"], ["ZW", "Zimbabwe"], ["AX", "Åland Islands"]];

export const countryName = (code: string): string =>
  COUNTRIES.find(([c]) => c === code.toUpperCase())?.[1] ?? code;

/** Withholding percent for a composer living in `code`, and whether it is from the table. */
export const withholdingFor = (code: string): { percent: number; known: boolean } => {
  const c = (code || "").toUpperCase();
  if (c in TREATY_ROYALTY_PERCENT) return { percent: TREATY_ROYALTY_PERCENT[c], known: true };
  return { percent: UK_BASIC_RATE_PERCENT, known: false };
};
