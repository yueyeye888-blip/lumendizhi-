// Fictional test-data generator. Output is random and not tied to real residences.
// Row: [code, 中文名, English name, number before street, postal code before city, postal pattern (N digit / A letter), streets, [city, region] list]
const ROWS = [
  ["US", "美国", "United States", 1, 0, "NNNNN", ["Maple St", "Oak Ave", "Cedar Ln"], [["Springfield", "IL"], ["Austin", "TX"], ["Portland", "OR"]]],
  ["GB", "英国", "United Kingdom", 1, 0, "AN NAA", ["High Street", "Station Road", "Church Lane"], [["Manchester", ""], ["Leeds", ""], ["Bristol", ""]]],
  ["CA", "加拿大", "Canada", 1, 0, "ANA NAN", ["King St", "Queen St", "Elm Dr"], [["Toronto", "ON"], ["Calgary", "AB"], ["Halifax", "NS"]]],
  ["AU", "澳大利亚", "Australia", 1, 0, "NNNN", ["George St", "Park Rd", "Beach Ave"], [["Brisbane", "QLD"], ["Perth", "WA"], ["Adelaide", "SA"]]],
  ["NZ", "新西兰", "New Zealand", 1, 0, "NNNN", ["Queen St", "Victoria Rd", "Beach Rd"], [["Auckland", ""], ["Wellington", ""], ["Dunedin", ""]]],
  ["IE", "爱尔兰", "Ireland", 1, 0, "ANN AAAA", ["Main Street", "Mill Lane", "Park Road"], [["Cork", ""], ["Galway", ""], ["Limerick", ""]]],
  ["DE", "德国", "Germany", 0, 1, "NNNNN", ["Hauptstrasse", "Bahnhofstrasse", "Gartenweg"], [["Hamburg", ""], ["Leipzig", ""], ["Kiel", ""]]],
  ["FR", "法国", "France", 1, 1, "NNNNN", ["Rue de la Paix", "Rue des Lilas", "Avenue Victor Hugo"], [["Lyon", ""], ["Lille", ""], ["Nantes", ""]]],
  ["IT", "意大利", "Italy", 0, 1, "NNNNN", ["Via Roma", "Via Garibaldi", "Corso Italia"], [["Torino", ""], ["Bologna", ""], ["Verona", ""]]],
  ["ES", "西班牙", "Spain", 0, 1, "NNNNN", ["Calle Mayor", "Calle Sol", "Avenida del Mar"], [["Valencia", ""], ["Sevilla", ""], ["Bilbao", ""]]],
  ["PT", "葡萄牙", "Portugal", 0, 1, "NNNN-NNN", ["Rua das Flores", "Rua do Sol", "Avenida Central"], [["Porto", ""], ["Coimbra", ""], ["Braga", ""]]],
  ["NL", "荷兰", "Netherlands", 0, 1, "NNNN AA", ["Kerkstraat", "Dorpsstraat", "Molenweg"], [["Utrecht", ""], ["Eindhoven", ""], ["Groningen", ""]]],
  ["BE", "比利时", "Belgium", 0, 1, "NNNN", ["Rue du Moulin", "Kerkstraat", "Avenue Louise"], [["Gent", ""], ["Liege", ""], ["Brugge", ""]]],
  ["LU", "卢森堡", "Luxembourg", 1, 1, "NNNN", ["Rue de la Gare", "Rue du Marche", "Avenue Monterey"], [["Esch-sur-Alzette", ""], ["Differdange", ""], ["Dudelange", ""]]],
  ["AT", "奥地利", "Austria", 0, 1, "NNNN", ["Hauptplatz", "Bahnhofstrasse", "Ringstrasse"], [["Graz", ""], ["Linz", ""], ["Salzburg", ""]]],
  ["CH", "瑞士", "Switzerland", 0, 1, "NNNN", ["Bahnhofstrasse", "Seestrasse", "Rue du Lac"], [["Geneve", ""], ["Basel", ""], ["Bern", ""]]],
  ["SE", "瑞典", "Sweden", 0, 1, "NNN NN", ["Storgatan", "Kyrkogatan", "Skolgatan"], [["Goteborg", ""], ["Malmo", ""], ["Uppsala", ""]]],
  ["NO", "挪威", "Norway", 0, 1, "NNNN", ["Storgata", "Kirkeveien", "Parkveien"], [["Bergen", ""], ["Trondheim", ""], ["Stavanger", ""]]],
  ["DK", "丹麦", "Denmark", 0, 1, "NNNN", ["Algade", "Norregade", "Skovvej"], [["Aarhus", ""], ["Odense", ""], ["Aalborg", ""]]],
  ["FI", "芬兰", "Finland", 0, 1, "NNNNN", ["Kauppakatu", "Kirkkokatu", "Puistotie"], [["Tampere", ""], ["Turku", ""], ["Oulu", ""]]],
  ["IS", "冰岛", "Iceland", 0, 1, "NNN", ["Laugavegur", "Skolavordustigur", "Hafnarstraeti"], [["Akureyri", ""], ["Kopavogur", ""], ["Hafnarfjordur", ""]]],
  ["PL", "波兰", "Poland", 0, 1, "NN-NNN", ["ul. Dluga", "ul. Lipowa", "ul. Polna"], [["Krakow", ""], ["Gdansk", ""], ["Wroclaw", ""]]],
  ["CZ", "捷克", "Czech Republic", 0, 1, "NNN NN", ["Nadrazni", "Hlavni", "Zahradni"], [["Brno", ""], ["Ostrava", ""], ["Plzen", ""]]],
  ["SK", "斯洛伐克", "Slovakia", 0, 1, "NNN NN", ["Hlavna", "Mlynska", "Sladkovicova"], [["Kosice", ""], ["Zilina", ""], ["Nitra", ""]]],
  ["HU", "匈牙利", "Hungary", 0, 1, "NNNN", ["Fo utca", "Kossuth utca", "Petofi utca"], [["Debrecen", ""], ["Szeged", ""], ["Pecs", ""]]],
  ["RO", "罗马尼亚", "Romania", 0, 1, "NNNNNN", ["Strada Libertatii", "Strada Florilor", "Bulevardul Unirii"], [["Cluj-Napoca", ""], ["Iasi", ""], ["Timisoara", ""]]],
  ["BG", "保加利亚", "Bulgaria", 0, 1, "NNNN", ["ul. Vitosha", "ul. Rakovski", "bul. Bulgaria"], [["Plovdiv", ""], ["Varna", ""], ["Burgas", ""]]],
  ["GR", "希腊", "Greece", 0, 1, "NNN NN", ["Odos Ermou", "Odos Athinas", "Leoforos Alexandras"], [["Thessaloniki", ""], ["Patras", ""], ["Heraklion", ""]]],
  ["LV", "拉脱维亚", "Latvia", 0, 0, "LV-NNNN", ["Brivibas iela", "Kalku iela", "Elizabetes iela"], [["Daugavpils", ""], ["Liepaja", ""], ["Jelgava", ""]]],
  ["LT", "立陶宛", "Lithuania", 0, 0, "LT-NNNNN", ["Gedimino pr.", "Vilniaus g.", "Kauno g."], [["Kaunas", ""], ["Klaipeda", ""], ["Siauliai", ""]]],
  ["EE", "爱沙尼亚", "Estonia", 0, 1, "NNNNN", ["Narva mnt", "Parnu mnt", "Tartu mnt"], [["Tartu", ""], ["Narva", ""], ["Parnu", ""]]],
  ["JP", "日本", "Japan", 1, 0, "NNN-NNNN", ["Chuo-dori", "Sakura-dori", "Ekimae-dori"], [["Osaka", "Osaka"], ["Nagoya", "Aichi"], ["Sapporo", "Hokkaido"]]],
  ["KR", "韩国", "South Korea", 1, 0, "NNNNN", ["Teheran-ro", "Sejong-daero", "Gangnam-daero"], [["Busan", ""], ["Daegu", ""], ["Incheon", ""]]],
  ["CN", "中国内地", "China", 1, 0, "NNNNNN", ["Zhongshan Road", "Renmin Road", "Jiefang Road"], [["Chengdu", "Sichuan"], ["Wuhan", "Hubei"], ["Hangzhou", "Zhejiang"]]],
  ["TW", "中国台湾", "Taiwan", 1, 0, "NNN", ["Zhongxiao Road", "Minsheng Road", "Zhongzheng Road"], [["Taichung", ""], ["Tainan", ""], ["Kaohsiung", ""]]],
  ["HK", "中国香港", "Hong Kong", 1, 0, "", ["Nathan Road", "Queen's Road", "Hennessy Road"], [["Kowloon", ""], ["Wan Chai", ""], ["Sha Tin", ""]]],
  ["MO", "中国澳门", "Macao", 1, 0, "", ["Avenida de Almeida Ribeiro", "Rua do Campo", "Avenida da Praia Grande"], [["Macao", ""], ["Taipa", ""], ["Coloane", ""]]],
  ["SG", "新加坡", "Singapore", 1, 0, "NNNNNN", ["Orchard Road", "Bukit Timah Road", "Jurong East Street"], [["Singapore", ""]]],
  ["MY", "马来西亚", "Malaysia", 1, 0, "NNNNN", ["Jalan Bunga Raya", "Jalan Merdeka", "Jalan Damai"], [["Shah Alam", "Selangor"], ["Kuantan", "Pahang"], ["Alor Setar", "Kedah"]]],
  ["TH", "泰国", "Thailand", 1, 0, "NNNNN", ["Sukhumvit Road", "Silom Road", "Rama IV Road"], [["Bangkok", ""], ["Chiang Mai", ""], ["Phuket", ""]]],
  ["VN", "越南", "Vietnam", 1, 0, "NNNNNN", ["Nguyen Hue", "Le Loi", "Tran Hung Dao"], [["Hanoi", ""], ["Da Nang", ""], ["Ho Chi Minh City", ""]]],
  ["PH", "菲律宾", "Philippines", 1, 0, "NNNN", ["Rizal Avenue", "Mabini Street", "Bonifacio Street"], [["Cebu City", ""], ["Makati", ""], ["Davao City", ""]]],
  ["ID", "印度尼西亚", "Indonesia", 1, 0, "NNNNN", ["Jalan Merdeka", "Jalan Sudirman", "Jalan Diponegoro"], [["Surabaya", ""], ["Bandung", ""], ["Medan", ""]]],
  ["KH", "柬埔寨", "Cambodia", 1, 0, "NNNNN", ["Street 51", "Norodom Boulevard", "Monivong Boulevard"], [["Phnom Penh", ""], ["Siem Reap", ""], ["Battambang", ""]]],
  ["IN", "印度", "India", 1, 0, "NNNNNN", ["MG Road", "Station Road", "Park Street"], [["Pune", "Maharashtra"], ["Jaipur", "Rajasthan"], ["Chennai", "Tamil Nadu"]]],
  ["PK", "巴基斯坦", "Pakistan", 1, 0, "NNNNN", ["Main Boulevard", "Mall Road", "Canal Road"], [["Lahore", "Punjab"], ["Karachi", "Sindh"], ["Peshawar", "KPK"]]],
  ["BD", "孟加拉国", "Bangladesh", 1, 0, "NNNN", ["Road 12", "Station Road", "Airport Road"], [["Dhaka", ""], ["Chattogram", ""], ["Sylhet", ""]]],
  ["AE", "阿联酋", "United Arab Emirates", 1, 0, "", ["Sheikh Zayed Road", "Al Wasl Road", "Corniche Road"], [["Dubai", ""], ["Abu Dhabi", ""], ["Sharjah", ""]]],
  ["QA", "卡塔尔", "Qatar", 1, 0, "", ["Al Corniche Street", "Salwa Road", "C Ring Road"], [["Doha", ""], ["Al Rayyan", ""], ["Al Wakrah", ""]]],
  ["BH", "巴林", "Bahrain", 1, 0, "NNN", ["Road 2803", "Al Fateh Highway", "Shaikh Khalifa Road"], [["Manama", ""], ["Riffa", ""], ["Muharraq", ""]]],
  ["ZA", "南非", "South Africa", 1, 0, "NNNN", ["Long Street", "Main Road", "Church Street"], [["Cape Town", ""], ["Durban", ""], ["Pretoria", ""]]],
  ["NG", "尼日利亚", "Nigeria", 1, 0, "NNNNNN", ["Adetokunbo Ademola Street", "Allen Avenue", "Awolowo Road"], [["Lagos", "Lagos"], ["Abuja", "FCT"], ["Ibadan", "Oyo"]]],
  ["GH", "加纳", "Ghana", 1, 0, "", ["Oxford Street", "Independence Avenue", "Ring Road"], [["Accra", ""], ["Kumasi", ""], ["Tamale", ""]]],
  ["KE", "肯尼亚", "Kenya", 1, 0, "NNNNN", ["Moi Avenue", "Kenyatta Avenue", "Ngong Road"], [["Nairobi", ""], ["Mombasa", ""], ["Kisumu", ""]]],
  ["RW", "卢旺达", "Rwanda", 1, 0, "", ["KG 7 Avenue", "KN 4 Street", "KK 15 Road"], [["Kigali", ""], ["Huye", ""], ["Musanze", ""]]],
  ["ZW", "津巴布韦", "Zimbabwe", 1, 0, "", ["Samora Machel Avenue", "Jason Moyo Street", "Borrowdale Road"], [["Harare", ""], ["Bulawayo", ""], ["Mutare", ""]]],
  ["LR", "利比里亚", "Liberia", 1, 0, "", ["Tubman Boulevard", "Broad Street", "Randall Street"], [["Monrovia", ""], ["Gbarnga", ""], ["Buchanan", ""]]],
  ["MX", "墨西哥", "Mexico", 0, 0, "NNNNN", ["Calle Hidalgo", "Avenida Juarez", "Calle Morelos"], [["Guadalajara", "Jalisco"], ["Monterrey", "Nuevo Leon"], ["Puebla", "Puebla"]]],
  ["BR", "巴西", "Brazil", 0, 0, "NNNNN-NNN", ["Rua das Palmeiras", "Avenida Brasil", "Rua da Paz"], [["Sao Paulo", "SP"], ["Curitiba", "PR"], ["Recife", "PE"]]],
  ["AR", "阿根廷", "Argentina", 0, 0, "ANNNN", ["Calle San Martin", "Avenida Belgrano", "Calle Mitre"], [["Cordoba", ""], ["Rosario", ""], ["Mendoza", ""]]],
  ["CO", "哥伦比亚", "Colombia", 0, 0, "NNNNNN", ["Carrera 7", "Calle 72", "Avenida Boyaca"], [["Medellin", ""], ["Cali", ""], ["Barranquilla", ""]]],
  ["GY", "圭亚那", "Guyana", 1, 0, "", ["Main Street", "Regent Street", "Camp Street"], [["Georgetown", ""], ["Linden", ""], ["New Amsterdam", ""]]],
];

/** @type {Record<string, { label: string, english: string, numFirst: number, postalFirst: number, pattern: string, streets: string[], cities: string[][] }>} */
export const TEST_ADDRESS_COUNTRIES = Object.fromEntries(ROWS.map(([code, label, english, numFirst, postalFirst, pattern, streets, cities]) => [code, { label, english, numFirst, postalFirst, pattern, streets, cities }]));

const pick = (items, random) => items[Math.floor(random() * items.length)];

const fillPattern = (pattern, random) => pattern.replace(/[NA]/g, (ch) => ch === "N" ? String(Math.floor(random() * 10)) : String.fromCharCode(65 + Math.floor(random() * 26)));

export function generateTestAddress(country, random = Math.random) {
  const spec = TEST_ADDRESS_COUNTRIES[country];
  if (!spec) throw new Error(`Unsupported country: ${country}`);
  const number = 1 + Math.floor(random() * 998);
  const street = pick(spec.streets, random);
  const [city, region] = pick(spec.cities, random);
  const postal = fillPattern(spec.pattern, random);
  const line1 = spec.numFirst ? `${number} ${street}` : `${street} ${number}`;
  const line2 = spec.postalFirst && postal ? `${postal} ${city}` : city;
  const line3Head = [region, spec.postalFirst ? "" : postal].filter(Boolean).join(" ");
  return [line1, line2, [line3Head, spec.english].filter(Boolean).join(", ")];
}
