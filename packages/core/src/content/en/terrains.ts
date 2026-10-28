// Généré une seule fois depuis docs/terrains-recits.md (octobre 2026).
// Ce fichier est désormais la source de vérité ; données, textes et types sont maintenus ici.
import type { TerrainDef } from '../../types';
import type { Commissariat, TerrainArticle } from '../fr/terrains';
import type { NewsText } from './types';
export interface EnglishTerrainContent {
  commissariat: Record<string, Omit<Commissariat, 'id'>>;
  definitions: Record<string, Omit<TerrainDef, 'id' | 'hex' | 'effects'>>;
  editorial: Record<string, Omit<TerrainArticle, 'id'>>;
  newsCards: Record<string, NewsText>;
  settlements: Record<string, Omit<TerrainArticle, 'id'>>;
  auctions: Record<string, Omit<TerrainArticle, 'id'>>;
}

export const EN_TERRAINS: EnglishTerrainContent = {
  "commissariat": {
    "commissariat": {
      "name": "Levelling-Up Agency",
      "acronym": "LUA",
      "motto": "Levelling up everyone, starting with the far end.",
      "blurb": "The LUA hands out starting plots to companies and generously compensates those it ships to the back of beyond: not a k$, just effects with strings attached and a warm thank-you."
    }
  },
  "definitions": {
    "quai-port-dividende": {
      "name": "Dividend Quay",
      "strengthLabel": "Market quayside",
      "counterLabel": null,
      "blurb": "40% of the population on site. Port-to-plant haul is free; deliveries still cost money. The stock exchange and ad agencies are at the factory gate: marketing x1.5.",
      "allocation": {
        "headline": "{company} lands the most coveted quay in Port Dividend",
        "body": "The agency grants {company} the capital's star quay: 40% of customers on site. Port-to-plant haul is free; deliveries cost money. The stock exchange and ad agencies are at the gate: marketing x1.5. {ceo} orders the champagne."
      }
    },
    "faubourgs-croissance": {
      "name": "Growthopolis Outskirts",
      "strengthLabel": "Campus next door",
      "counterLabel": "Far from port",
      "blurb": "R&D runs x2 to the hum of Unicorn Valley's drones, but the port is at the far end of the map.",
      "allocation": {
        "headline": "{company} moves in next to Unicorn Valley",
        "body": "The LUA has parked {company} on the Growthopolis Outskirts, within drone-buzzing distance of the campus: R&D output x2. The port sits at the far end of the map; {ceo} is already saying \"ecosystem.\""
      }
    },
    "front-de-mer-saint-benefice": {
      "name": "Profit Springs Seafront",
      "strengthLabel": "Business school",
      "counterLabel": "Seasonal crowds",
      "blurb": "Marketing makes waves (x1.8) thanks to the business school, but the resort runs on the tourist seasons.",
      "allocation": {
        "headline": "{company} sets up shop on the Profit Springs Seafront",
        "body": "The LUA has granted {company} a plot facing Bonus Bay, right opposite the business school: marketing lands x1.8 harder. The resort runs on the tourist seasons; {ceo} promises barefoot board meetings."
      }
    },
    "portes-petit-rabais": {
      "name": "Gates of Discount Hollow",
      "strengthLabel": "Payroll tax holiday",
      "counterLabel": "Middle of nowhere",
      "blurb": "Labor at -20% for 8 quarters, provided you accept an official address that ends in \"the middle of nowhere\".",
      "allocation": {
        "headline": "{company} exiled to the Gates of Discount Hollow",
        "body": "The LUA, which generously compensates those it sends to the end of the world, grants {company} a payroll-tax exemption: labor -20% for 8 quarters. In return, Discount Hollow is small, far away, and {ceo}'s GPS filed for early retirement somewhere on the county road."
      }
    },
    "ristourne-le-bourg": {
      "name": "Rebate Falls",
      "strengthLabel": "Labor pool",
      "counterLabel": "Cold chain",
      "blurb": "Labor -10% and spoilage cut in half: the labor pool is full, the yogurts immortal, and the local bank delighted.",
      "allocation": {
        "headline": "{company} hits the Rebate Falls jackpot",
        "body": "The LUA has spoiled {company}: a rural labor pool (labor -10%) and a public cold chain that halves perishability. In Rebate Falls, even the yogurts outlive their CEOs. The local bank is relieved: no one asks it to lend at a loss anymore. {ceo} wept, briefly."
      }
    },
    "plaine-aux-subventions": {
      "name": "Subsidy Flats",
      "strengthLabel": "Subsidized wages",
      "counterLabel": "No local customers",
      "blurb": "Wages at -20%, but not a customer in sight: even the village name was secured with a matching grant.",
      "allocation": {
        "headline": "{company} takes up residence on Subsidy Flats",
        "body": "True to its own land registry, the LUA settles {company} on Subsidy Flats: the state covers part of the payroll (labor -20%). One snag: nobody lives on the Flats, so nobody shops there either. {ceo} is drafting a grant application for customers."
      }
    },
    "monts-defiscalises": {
      "name": "Tax Shelter Peaks",
      "strengthLabel": "Tax at 5%",
      "counterLabel": "Mountain roads",
      "blurb": "Tax at 5% for the company, labor -10% for its starting plant; mountain roads: up here, oxygen is scarce and so are trucks.",
      "allocation": {
        "headline": "{company} climbs into the Tax Shelter Peaks",
        "body": "The LUA has shipped {company} into the Tax Shelter Peaks: tax at 5% for the company, labor -10% for its starting plant. Mountain roads and truck brakes with a short life expectancy: {ceo} is buying a mule."
      }
    },
    "ile-aux-niches": {
      "name": "Loophole Island",
      "strengthLabel": "Tax haven",
      "counterLabel": "Under watch",
      "blurb": "No tax, \"duty-free\" prices that sell, a plant that resells at 80%; scandal increases half as large again: paradise, but with cameras.",
      "allocation": {
        "headline": "{company} drops anchor on Loophole Island",
        "body": "{company} settles off Dividend Gulf: zero tax, prices that feel 4% cheaper (the \"duty-free\" label), a plant that resells at 80% of its value. The Supranational Audit Office clapped with one hand: scandal increases grow by half. {ceo} put up curtains and hired a top lawyer."
      }
    }
  },
  "editorial": {
    "ouverture-n1": {
      "headline": "LUA unveils eight starting plots: compensation comes in effects, not cash",
      "body": "Eight starting plots: the LUA unveils its plan for the founding companies. Not a k$ in compensation: effects with strings attached, for the starting plant or its company. \"We generously compensate,\" the Agency insists."
    }
  },
  "newsCards": {
    "loc-quai-port-dividende-1": {
      "headline": "Dock strike: customers of {company}'s plant are stuck out in Dividend Gulf",
      "body": "Picket lines at the port gates keep customers away from {company}'s starting plant for two quarters. Its demand drops 20 percent; the cranes make very handsome silhouettes.",
      "rumor": "Port Dividend dockers are reportedly drafting a strike notice \"with lovely signs and an ambitious calendar.\""
    },
    "loc-quai-port-dividende-2": {
      "headline": "Ad agency merger in Port Dividend: the starting plant's campaigns lose their punch",
      "body": "The quay's three ad agencies merged \"for synergy\" and laid off creatives by the floor. For three quarters, marketing at {company}'s starting plant loses 25 percent of its punch; the interim logo is a blue rectangle.",
      "rumor": "The merged agency's new logo has reportedly been \"under review\" since spring."
    },
    "loc-quai-port-dividende-3": {
      "headline": "Cruise season: shiploads of customers dock at the foot of the starting plant",
      "body": "Cruise passengers flood the capital with the appetite of retirees at a clearance sale. For two quarters, demand at {company}'s starting plant rises 10 percent; its shop has never seen so many sun hats."
    },
    "loc-faubourgs-croissance-1": {
      "headline": "Unicorn Valley walkout: {company}'s researchers keep their ideas to themselves",
      "body": "The campus next door is on strike and, out of solidarity or sheer habit, the engineering office at {company}'s starting plant slows to a crawl. Its research loses 30 percent of its punch for three quarters; the whiteboards stay white.",
      "rumor": "Unicorn Valley researcher unions are reportedly ordering banners, \"sustainably sourced, of course.\""
    },
    "loc-faubourgs-croissance-2": {
      "headline": "Record graduating class at Unicorn Valley: engineers rain down on the Outskirts",
      "body": "Hundreds of fresh graduates want a first job within cycling distance of campus. For three quarters, {company}'s starting plant hires at gentle prices: its labor runs 10 percent cheaper, bike not included."
    },
    "loc-faubourgs-croissance-3": {
      "headline": "Outskirts property bubble: {company}'s rent starts doing push-ups",
      "body": "Every square foot near campus is fought over with funding rounds. For three quarters, fixed costs at {company}'s starting plant climb 20 percent; the landlords have started saying \"ecosystem.\""
    },
    "loc-front-de-mer-saint-benefice-1": {
      "headline": "Profit Springs: the business school loses its faculty, poached by a rival campus",
      "body": "The marketing stars have signed elsewhere, \"for the quality of life,\" they say, gazing at the sea they are leaving. For two quarters, campaigns at {company}'s starting plant lose 25 percent of their punch.",
      "rumor": "Profit Springs professors were reportedly spotted at a travel agency, \"as a group.\""
    },
    "loc-front-de-mer-saint-benefice-2": {
      "headline": "Record summer in Profit Springs: tourists buy everything, including the local output",
      "body": "The resort is packed like a vacation suitcase. For two quarters, demand at {company}'s starting plant rises 15 percent; even its output comes with a faint whiff of tanning oil."
    },
    "loc-front-de-mer-saint-benefice-3": {
      "headline": "Corporate Water Scooter Festival: seafront rents take some sun and a 15 percent hike",
      "body": "Three thousand executives in wetsuits land to \"network on the water.\" For two quarters, fixed costs at {company}'s starting plant rise 15 percent, even if {ceo} hates water scooters."
    },
    "loc-portes-petit-rabais-1": {
      "headline": "Audit at Discount Hollow: the payroll-tax break is suspended ahead of schedule",
      "body": "A LUA inspector made the trip to the end of the world and fully intends to make it count. For two quarters, the 20 percent payroll break at {company}'s starting plant is suspended.",
      "rumor": "A LUA inspector has reportedly asked for a map of Discount Hollow at the nearest station, \"three hours away.\""
    },
    "loc-portes-petit-rabais-2": {
      "headline": "A TV segment crowns Discount Hollow \"the most authentic village at the end of the world\"",
      "body": "Since the TV segment aired, visitors make the trek to see \"how things used to be.\" For three quarters, demand at {company}'s starting plant rises 15 percent, powered by nostalgia tourism."
    },
    "loc-portes-petit-rabais-3": {
      "headline": "LUA remoteness bonus: job seekers roll into Discount Hollow by the coachload",
      "body": "The LUA pays applicants to come work \"where even the GPS hesitates.\" For four quarters, labor at {company}'s starting plant costs 12 percent less.",
      "rumor": "The LUA is reportedly drafting a bonus \"for anyone willing to stay more than one winter.\""
    },
    "loc-ristourne-le-bourg-1": {
      "headline": "Rural exodus empties the Rebate Falls labor pool",
      "body": "With the valley's last bus line cancelled, the big-city factory next door poaches the town's workforce. Staffing {company}'s starting plant costs 20 percent more for three quarters.",
      "rumor": "City recruiters have reportedly been spotted waiting outside the Rebate Falls church on Sundays."
    },
    "loc-ristourne-le-bourg-2": {
      "headline": "Rebate Falls fridges get a next-generation chill",
      "body": "The cold-chain co-op replaced the compressors that used to cough. At {company}'s starting plant, stock ages more slowly than campaign promises: spoilage drops 20 percent for three quarters.",
      "rumor": "Brand-new refrigerated trucks have been spotted on the road to Rebate Falls."
    },
    "loc-ristourne-le-bourg-3": {
      "headline": "Farm yogurt craze: the East takes over the chilled aisle",
      "body": "Wellness influencers now swear by Rebate Falls authenticity and nothing else. Demand for {company}'s starting plant rises 10 percent for two quarters, from bulk orders to chilled aisles."
    },
    "loc-plaine-aux-subventions-1": {
      "headline": "LUA trims the Subsidy Flats wage subsidies",
      "body": "A budget incident - form 47-B was missing - cuts the wage subsidy at {company}'s starting plant. Hiring costs 15 percent more for three quarters, the time it takes to locate the form.",
      "rumor": "At the LUA counter, whispers say a very important form went missing somewhere on the Flats."
    },
    "loc-plaine-aux-subventions-2": {
      "headline": "TV crews roll into Subsidy Flats, and coachloads of customers follow",
      "body": "A consumer show spent twenty minutes on {company}'s \"plant lost in the middle of nowhere.\" Coachloads of curious shoppers followed: demand at its starting plant rises 20 percent for three quarters.",
      "rumor": "The show's producers are reportedly casting extras with an authentic flatland stare."
    },
    "loc-plaine-aux-subventions-3": {
      "headline": "River Yield bursts its banks: {company}'s plant pumps around the clock",
      "body": "No one is surprised: the Flats are flat, and so is the water. Pump rental, sandbags and mopping shifts push overheads at {company}'s starting plant up 10 percent for two quarters."
    },
    "loc-monts-defiscalises-1": {
      "headline": "SMAO freezes the Peaks free zone: {company} loses its 5% tax rate",
      "body": "SMAO inspectors found the Tax Shelter Peaks suspiciously undertaxed. The free zone is suspended: all of {company}, including later products, loses its sweetheart rate and pays the ordinary tax rate for three quarters.",
      "rumor": "Officials in SMAO-branded parkas have reportedly taken lodgings in the Tax Shelter Peaks."
    },
    "loc-monts-defiscalises-2": {
      "headline": "Altitude premium in the Tax Shelter Peaks: thin air costs real money",
      "body": "Snowed-in seasonal workers won a bonus for services rendered above the clouds. Staffing {company}'s starting plant costs 15 percent more for two quarters.",
      "rumor": "Peaks seasonal workers are said to be drafting demands that measure up to the altitude."
    },
    "loc-monts-defiscalises-3": {
      "headline": "Epic winter: skiers slide all the way to {company}'s starting plant",
      "body": "Record snowfall, record sales: tourists buy anything with a made-in-the-mountains label. Demand for {company}'s starting plant rises 10 percent for two quarters."
    },
    "loc-ile-aux-niches-1": {
      "headline": "BonusPapers: Loophole Island's tax schemes splashed across front pages",
      "body": "A whistleblower handed over twelve thousand USB sticks from trust firms. Audits are stepped up: all of {company}, including later products, loses its tax-haven rate and pays the ordinary rate for three quarters.",
      "rumor": "A trust-firm intern was reportedly seen copying an awful lot of files on Loophole Island."
    },
    "loc-ile-aux-niches-2": {
      "headline": "Regulators camp out on Loophole Island: every invoice is now a sensitive document",
      "body": "Since the BonusPapers, inspectors rented deckchairs facing the trust firms. Under the spotlight every trick shows: scandal increases across all of {company} are amplified by 30 percent for three quarters."
    },
    "loc-ile-aux-niches-3": {
      "headline": "Empty offices going cheap: shell companies sublet to {company}'s plant",
      "body": "Shell-company head offices, deserted since the leaks, are subletting at bargain rates. {company}'s starting plant inherits ergonomic chairs and overheads 10 percent lower for three quarters."
    },
    "loc-chaleur-1": {
      "headline": "Polar winter: {company}'s server heat sells like hot cakes",
      "body": "The thermometer gave up. Towns heated by {company}'s servers now pay double: for two quarters the plant's heat credit is multiplied by 2. {ceo} is praying for a long winter.",
      "rumor": "Forecasters are said to promise a winter not fit for an algorithm."
    },
    "loc-chaleur-2": {
      "headline": "Heatwave: the town returns {company}'s heat to sender",
      "body": "Forty degrees in the shade of the antennas. Nobody wants district heating now: for two quarters the heat credit of {company}'s plant drops to zero, and the servers run with the windows open.",
      "rumor": "The ministry is said to be drafting a Fans For All plan."
    },
    "loc-chaleur-3": {
      "headline": "City hall buys a giant heat pump: {company}'s servers are left out in the cold",
      "body": "After three years of works and a budget overrun hailed as historic, the municipal network needs only half the servers' heat: for three quarters the heat credit of {company}'s plant is halved."
    },
    "loc-chaleur-4": {
      "headline": "Green Heat label: {company}'s customers mine with a clear conscience",
      "body": "The heating network got a label. The ads show smiling pensioners by a radiator, and sales follow: for two quarters demand for {company}'s plant rises by 10%."
    },
    "loc-chaleur-5": {
      "headline": "Record season in the Tax Shelter Peaks: the resort orders half as much heat again from {company}",
      "body": "Packed slopes, frozen chalets, demanding skiers. The resort buys every unit of heat it can get: for two quarters the heat credit of {company}'s Peaks plant is multiplied by 1.5.",
      "rumor": "The resort has reportedly ordered snow cannons in case winter forgets to show up."
    }
  },
  "settlements": {
    "settle-quai-port-dividende-1": {
      "headline": "{company} opens at Dividend Quay: {product} storms the harbour",
      "body": "Forty percent of customers within crane reach. Port-to-plant haul is free; deliveries cost money. Ad agencies are at the plant's gate: marketing x1.5. The stock exchange applauds."
    },
    "settle-quai-port-dividende-2": {
      "headline": "{company} launches {product}: the ad agency gives it two cranes up",
      "body": "The quay's agency keeps marketing x1.5 for the starting plant alone. {product} inherits no terrain effects: the stock exchange applauds, but the campaign is sold separately."
    },
    "settle-faubourgs-croissance-1": {
      "headline": "{company} opens on the Growthopolis Outskirts: {product} under the drones",
      "body": "Unicorn Valley's campus is next to the starting plant, so its R&D runs x2. The port, meanwhile, is at the end of the world; the LUA calls this an ecosystem."
    },
    "settle-faubourgs-croissance-2": {
      "headline": "{company} unveils {product}: the unicorns bleat with envy",
      "body": "The campus serves only the starting plant: its R&D stays x2. {product} gets no terrain effects. The unicorns have a name for this: disruptive exclusion."
    },
    "settle-front-de-mer-saint-benefice-1": {
      "headline": "{company} opens a seafront plant: {product} gets a view of Bonus Bay",
      "body": "Profit Springs' business school backs the starting plant: marketing x1.8. The Bonus Bay view comes at no extra charge; the deckchair, you bring."
    },
    "settle-front-de-mer-saint-benefice-2": {
      "headline": "{company} launches {product}: the business school pitches its small print",
      "body": "Graduates keep marketing x1.8 for the starting plant. {product} inherits no terrain effects. Between two sunbaths, the school pitched an exclusion clause; the bill no longer even smells of iodine."
    },
    "settle-portes-petit-rabais-1": {
      "headline": "{company} opens at the Gates of Discount Hollow: {product} will travel far",
      "body": "The starting plant gets a payroll-tax break: labor -20% for the first 8 quarters, courtesy of the LUA. In exchange, the town sits at the end of the world and the customer map runs out just before it."
    },
    "settle-portes-petit-rabais-2": {
      "headline": "{company} launches {product}: the LUA offers no family discount",
      "body": "The payroll break (-20% for the first 8 quarters) belongs to the starting plant alone. {product} gets no terrain effects. The postman demanded hazard pay just to deliver the rejection slip."
    },
    "settle-ristourne-le-bourg-1": {
      "headline": "{company} opens in Rebate Falls: {product}, cheap hands, immortal yogurt",
      "body": "The rural labor pool cuts the starting plant's labor costs by 10% and the cold chain halves spoilage. {product} will expire about as slowly as the county board's meetings."
    },
    "settle-ristourne-le-bourg-2": {
      "headline": "{company} launches {product}: rival dairies suspect sorcery, or accounting",
      "body": "Labor -10% and half the spoilage remain reserved for the starting plant. {product} inherits no terrain effects. The county board refuses to share immortality."
    },
    "settle-plaine-aux-subventions-1": {
      "headline": "{company} opens on Subsidy Flats: {product}, wages -20%, zero customers",
      "body": "The LUA foots 20% of the starting plant's payroll. All {company} has left to do is make {product} and find customers elsewhere: the Flats are empty."
    },
    "settle-plaine-aux-subventions-2": {
      "headline": "{company} launches {product}: even the grant has no offspring",
      "body": "The LUA keeps wages at -20% for the starting plant. {product} gets no terrain effects. {company} has applied for a grant to fund its grant application; the form is still under review."
    },
    "settle-monts-defiscalises-1": {
      "headline": "{company} opens in Tax Shelter Peaks: {product}, 5% tax, thin air",
      "body": "The starting plant's labor costs 10% less; every delivery is a climb. Company tax is 5% while that plant stays active on its hex, without a merger. The LUA recommends a mule."
    },
    "settle-monts-defiscalises-2": {
      "headline": "{company} launches {product}: the tax break travels light, cheap labor stays put",
      "body": "{product} shares {company}'s 5% company tax while the starting plant stays active on its hex, without a merger. Labor -10% stays with that plant; the new one inherits neither the wage deal nor its snow chains."
    },
    "settle-ile-aux-niches-1": {
      "headline": "{company} opens on Loophole Island: {product}, zero tax, cameras included",
      "body": "Zero tax, prices that feel 4% cheaper, 80% resale and scandal increases x1.5 for {company}, while the starting plant stays active on its hex, without a merger. Gulf auditors watch: the gauge climbs faster than the tide."
    },
    "settle-ile-aux-niches-2": {
      "headline": "{company} launches {product}, lawyers on speed dial",
      "body": "{product} shares {company}'s zero tax, prices that feel 4% cheaper, 80% resale and scandal increases x1.5 while the starting plant stays active on its hex, without a merger. The press boat already knows the way."
    }
  },
  "auctions": {
    "auction-hex-1": {
      "headline": "Bidding war for {hex}: {bidders} bidders, the auctioneer's gavel files for overtime",
      "body": "{company} takes hex {hex} for {price} after a sealed-bid shootout among {bidders} bidders. The LUA hails \"a fine moment of market efficiency\"; the winner's treasurer hails from the infirmary."
    },
    "auction-hex-2": {
      "headline": "Auctions: {company} waits for silence, snaps up {hex} at the first hammer stroke",
      "body": "Nobody else turned up at the counter: {company} walks away with hex {hex} at the reserve price, {price}. The auctioneer never got round to serving the tea."
    },
    "auction-hex-3": {
      "headline": "{price} for {hex}: a price that made the land registry weep",
      "body": "{company} carried off {hex} for {price}, a sum the LUA's experts called \"frankly decorative\". The Agency notes the hex includes no beach, no mineral deposit and no excuse."
    },
    "auction-hex-4": {
      "headline": "Beaten on {hex}, a loser demands a recount of the sealed envelopes",
      "body": "{company} wins {hex} for {price}. The runner-up denounces \"suspiciously well-sealed envelopes\" and files a complaint. The LUA sent the runner-up a plot map and its condolences."
    },
    "auction-hex-5": {
      "headline": "{hex} knocked down for {price}: the gavel double-checked the zeros",
      "body": "For {price}, {company} walks off with hex {hex} and a faint whiff of collective unease. The Agency insists the bid was \"entirely regular, thank you for not asking\"."
    },
    "auction-hex-6": {
      "headline": "{company} takes {hex} after the favorite vanishes mid-auction",
      "body": "The favorite, an anonymous bidder tied up in a board meeting, never filed their envelope. {company} takes {hex} for {price}. The LUA calls it chance; everyone nods."
    }
  }
};
