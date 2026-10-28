import type { NewsText } from '../types';

/**
 * Batch “map”: English texts for ../../fr/extra/map.ts, keyed by the same ids. Life in the zones and on the roads of
 * the Republic of Upper Margin: per-zone labor stories (strikes, allowances, floods, robots), road and transport
 * stories (tolls, blockades, snow, ice), and commodity/demand combinations. About twenty entries and five fake
 * rumors. Tone of the batch: regional news column, with place names.
 */
export const EN_NEWS_MAP: Record<string, NewsText> = {
  mp_growth_city_telework: {
    headline: 'Growthopolis workers discover remote work; the machine tools have not',
    body: 'Plants in the big north-eastern city are crawling: crews now “follow the assembly line on video calls.” Wages, for their part, kept coming into the office.',
    rumor: 'Growthopolis factory hands were reportedly spotted buying webcams in bulk.',
  },
  mp_plain_subsidy: {
    headline: 'Subsidy Flats finally gets a subsidy: the name was not lying',
    body: 'The ministry will cover part of the wages at plants on the flats for three quarters. The governor thanked the land registry, which called it at the christening.',
  },
  mp_diesel_champagne: {
    headline: 'Diesel soars: truckers now bill by the bottle of champagne',
    body: 'Everything on wheels costs more for two quarters. Plants in the capital, a stone’s throw from the port, watch the trucks go by with a faint smile.',
    rumor: 'Service stations along the A1 have reportedly ordered new price tags, “with more digits.”',
  },

  // ---------------------------------------------------------------------------
  // The capital
  // ---------------------------------------------------------------------------
  mp_capital_dockers_strike: {
    headline: 'Dockers walk out at Port Dividend: container ships queue up in Dividend Gulf',
    body: 'The cranes are idle, the picket lines are not. Getting anything shipped through the capital now costs an arm and a leg.',
    rumor: 'Port Dividend dockers are reportedly unhappy with “a whole bunch of things.” A strike fund was allegedly opened.',
  },
  mp_capital_port_robots: {
    headline: 'Port Dividend automates its cranes; operators retrained as “drone whisperers”',
    body: 'The cranes now unload by themselves and, unlike the dockers, have never once complained about the coffee. Labor in the capital costs markedly less.',
  },

  // ---------------------------------------------------------------------------
  // The south
  // ---------------------------------------------------------------------------
  mp_south_wage_claims: {
    headline: 'Profit Springs unions demand “their share of the profit”',
    body: 'Negotiators arrived with a calculator and left with a much bigger one. Wages across the south head up for a few quarters.',
  },
  mp_south_heatwave: {
    headline: 'Heatwave in the south: the thermometers melt before the asphalt does',
    body: 'Profit Springs is roasting, fans are sold out, and energy drinks are flying off the shelves.',
    rumor: 'A “historic” heatwave is reportedly brewing over the south. Ice vendors are said to be rubbing their hands.',
  },

  // ---------------------------------------------------------------------------
  // The east and the north
  // ---------------------------------------------------------------------------
  mp_east_robots: {
    headline: 'Rebate Falls plant replaces the night shift with second-hand robots',
    body: 'The robots squeak a little but never ask for a raise. Labor in the east has never been so cheap.',
    rumor: 'A Rebate Falls factory is reportedly stockpiling “gently used” robots in a hangar.',
  },
  mp_north_seasonal: {
    headline: 'Seasonal workers arrive in Discount Hollow by the coachload',
    body: 'They sleep in the gym and thank the coach driver. Local plants are getting their labor at bargain-bin prices for a while.',
  },

  // ---------------------------------------------------------------------------
  // The plain
  // ---------------------------------------------------------------------------
  mp_plain_flood: {
    headline: 'The River Yield bursts its banks: Subsidy Flats sugar beets take a swim',
    body: 'The fields are underwater and so is the harvest. Around the flats, labor is scarce and the sugar sites are counting their losses.',
    rumor: 'The River Yield is reportedly swelling ominously over Subsidy Flats. Rubber boots are said to be in high demand.',
  },

  // ---------------------------------------------------------------------------
  // The mountains
  // ---------------------------------------------------------------------------
  mp_mountain_mine_collapse: {
    headline: 'Gallery collapse in a Tax Shelter Peaks lithium mine',
    body: 'The pit is closed until further notice, and rescuers are picking their way through tunnels that were a bad idea to begin with. Labor and lithium sites in the mountains are hit hard.',
    rumor: 'Unsettling creaks have reportedly been heard in the galleries of a Tax Shelter Peaks lithium mine.',
  },
  mp_mountain_altitude_allowance: {
    headline: 'Miners win an altitude allowance; wages climb faster than the cable car',
    body: 'The Tax Shelter Peaks arbitration panel ruled that air this thin deserves a bonus. Payrolls in the mountains take off for a few quarters.',
  },

  // ---------------------------------------------------------------------------
  // The roads
  // ---------------------------------------------------------------------------
  mp_a1_truckers_strike: {
    headline: 'Truckers blockade the A1 along the north shore of Lake Offshore',
    body: 'Tires are burning, and so is the delivery calendar. Everything that rolls between the capital and the north-east now costs more.',
    rumor: 'Truckers are reportedly stockpiling grills and folding chairs near the A1, “just in case.”',
  },
  mp_a2_toll_war: {
    headline: 'Toll war on the A2: two concession companies outbid each other upward',
    body: 'Drivers are invited to vote with their wallets at every exit. Heading south from the capital has never been so dignified, nor so pricey.',
  },
  mp_pass_snow: {
    headline: 'Early snow closes the pass between Growthopolis and the Tax Shelter Peaks',
    body: 'The snowplows were reportedly still in summer storage. Trucks bound for the lithium mines make do with the long way around, and transport costs climb.',
  },
  mp_bypass_opening: {
    headline: 'New bypass opens south of Lake Offshore: trucks stop touring the lake',
    body: 'Haulers used to get the full scenic shoreline, toll of patience included. With the shortcut open, moving freight costs noticeably less.',
    rumor: 'A brand-new ribbon of asphalt is reportedly hiding somewhere south of Lake Offshore. An inauguration is said to be imminent.',
  },
  mp_lake_frozen: {
    headline: 'Lake Offshore freezes over: truckers drive straight across the ice',
    body: '“The ice doesn’t charge tolls,” one driver explains, already halfway to Bonus Bay. The insurance companies are less enthusiastic.',
  },

  // ---------------------------------------------------------------------------
  // Commodities and the big city
  // ---------------------------------------------------------------------------
  mp_unicorn_valley_chips: {
    headline: 'Boom at Unicorn Valley: the chip foundries run flat out',
    body: 'Orders are piling up faster than the wafers. Chip prices head north while gadget makers queue at the door, buzzing with excitement.',
    rumor: 'Unicorn Valley chip foundries have reportedly signed a stack of hush-hush orders. The valley is said to be buzzing.',
  },
  mp_offshore_pipeline_leak: {
    headline: 'Oil pipeline leaks off Cape of Good Hedge: a slick “the size of a dividend”',
    body: 'Emergency crews are mopping up under the seagulls’ disappointed gaze. Pumping crude through the offshore lines costs more for a while.',
  },
  mp_growth_housing: {
    headline: 'Housing crunch in Growthopolis: a studio rents for a line of code per month',
    body: 'Tech workers now sleep three to a parking spot. Employers, cornered, are raising wages to match the rent.',
  },
};

export const EN_RUMORS_MAP: Record<string, string> = {
  mp_fake_a2_tolls: 'The A2 highway may start charging “by the mile and by the toll clerk’s mood.”',
  mp_fake_lake_bridge: 'A toll bridge may one day span Lake Offshore, charged both ways, “swans included.”',
  mp_fake_pass_tunnel: 'Miners are reportedly ready to fund a tunnel under the Tax Shelter Peaks themselves, “in crypto, of course.”',
  mp_fake_docker_gondola: 'A cable car could soon ferry Port Dividend dockers straight over the picket lines, “in all-weather comfort.”',
  mp_fake_merger_towns: 'Rebate Falls and Discount Hollow are reportedly discussing a merger into a single town, tentatively named “Rebate Hollow.”',
};
