import type { NewsText } from '../types';

/**
 * Batch “commodities”: English texts for ../../fr/extra/commodities.ts, keyed by the same ids.
 * Tone of the batch: deadpan wire-service dispatch, reporting the absurd with a straight face.
 */
export const EN_NEWS_COMMODITIES: Record<string, NewsText> = {
  // ---------------------------------------------------------------------------
  // Oil
  // ---------------------------------------------------------------------------
  cm_oil_pipeline_knot: {
    headline: 'Pipeline ties itself in a knot. Engineers confirm it is a knot',
    body: 'Crude has not moved since Tuesday. A troop of scouts has been dispatched to the site. Oil edges higher pending a more detailed diagnosis.',
    rumor: 'A major pipeline is reportedly showing “unusual flow.” The operator refers to “a geometry currently under review.”',
  },
  cm_oil_platform_retirement: {
    headline: 'Oil rig takes early retirement, leaves with a gold watch and a sheet cake',
    body: 'The rig filed its paperwork and stopped pumping. The farewell party is Friday. Crude supply tightens for several quarters.',
  },
  cm_oil_backyard_gusher: {
    headline: 'Retiree strikes oil while planting tomatoes. The tomatoes are lost',
    body: 'The gusher reached forty feet. The retiree requested a tarp. Oil prices drop; the tomatoes were unavailable for comment.',
  },
  cm_oil_refinery_overtime: {
    headline: 'Refineries ran all weekend due to a calendar error',
    body: 'Nobody mentioned it was Sunday. Three days of surplus output reach the market. The barrel is correspondingly lighter.',
    rumor: 'Several refineries reportedly received a “non-compliant” calendar. The night shift was allegedly not informed.',
  },
  cm_oil_tanker_traffic_jam: {
    headline: '400-tanker traffic jam in a strait: the first one stalled',
    body: 'The lead captain reports having “forgotten to shift into neutral.” Crude waits in single file. Buyers pay for the wait.',
    rumor: 'A busy strait is reportedly logging an “unusual” line of ships. Horns are said to be audible from shore.',
  },
  cm_oil_bicycle_month: {
    headline: 'Bike Month extended until further notice',
    body: 'The organizing committee reports it could not find the button to stop it. Fuel consumption slips. The barrel takes note.',
  },
  cm_oil_ministry_leak: {
    headline: 'Energy Department accidentally publishes the real price of oil. It was lower',
    body: 'The document was attached to a memo about summer hours. Traders adjusted their quotes accordingly, then went to lunch.',
  },
  cm_oil_sea_of_oil: {
    headline: 'Sea of oil discovered under the sea. The sea above is unaffected',
    body: 'Geologists describe “a sea below the other one.” Extraction begins immediately. Global crude supply widens for the long haul.',
    rumor: 'A research vessel has reportedly logged “something very large and very black” beneath a well-known sea.',
  },
  cm_oil_barrel_shortage: {
    headline: 'Barrel shortage: the oil exists, but has nowhere to go',
    body: 'Coopers are overwhelmed. Crude is being stored in salad bowls for the time being. Prices climb, salad bowl included.',
    rumor: 'Coopers have reportedly declined all new orders “until further notice.” The salad bowl market is said to be one to watch.',
  },
  cm_oil_crypto_diesel: {
    headline: 'Crypto miners hook their farms up to diesel generators “for nostalgia”',
    body: 'Diesel is deemed “more authentic.” Tokens now trade with a faint hint of gasoline. Oil gets scarce; crypto is doing fine.',
  },

  // ---------------------------------------------------------------------------
  // Lithium
  // ---------------------------------------------------------------------------
  cm_lithium_asteroid: {
    headline: 'Asteroid of pure lithium lands in a field. Owner asks that it be removed',
    body: 'The object is 130 feet across and is in the way of the harvest. Several manufacturers have offered to haul it off for free. Lithium drops sharply.',
    rumor: 'Observatories are reportedly tracking an object “of interesting composition” on a re-entry trajectory.',
  },
  cm_lithium_export_quota: {
    headline: 'Top lithium exporter discovers it has lithium, suspends exports',
    body: 'The minister wishes to “take a look at it first.” The suspension will last “as long as it takes.” Buyers wait.',
    rumor: 'A major lithium-exporting country has reportedly ordered a full inventory of its mines. Customs is said to be standing by.',
  },
  cm_lithium_recycling_works: {
    headline: 'Battery recycling finally works; engineers can’t figure out what they fixed',
    body: 'The plant had been running for two years to general indifference. Recovered lithium reaches the market. Prices draw their own conclusions.',
  },
  cm_lithium_salt_battery: {
    headline: 'Table-salt battery approved. Lithium producers take note',
    body: 'The prototype works “like a normal battery, but saltier.” Lithium orders thin out for the foreseeable future.',
    rumor: 'A lab has reportedly filed a patent involving “a common condiment.” Lithium traders are asking questions.',
  },
  cm_lithium_mine_flood: {
    headline: 'Largest lithium mine flooded: the neighboring lake was relocated to the wrong spot',
    body: 'The contractor insists it “followed the plan.” The plan was upside down. Battery makers are revising their quotes.',
    rumor: 'Earthmoving equipment was reportedly spotted near a lake, with a blueprint held in an “unconventional” manner.',
  },
  cm_lithium_hoverboard_revival: {
    headline: 'Hoverboards are back: lithium warehouses empty out in an orderly fashion',
    body: 'The fad returned without warning. Board factories absorb every available ton. E-scooters wait on the sidewalk.',
  },
  cm_lithium_pharmacy_stock: {
    headline: 'Medical board advises against lithium cures: pharmacies sell off their stock',
    body: 'Patients are advised to “calm down some other way.” Several tons return to the market. Lithium relaxes, as prescribed.',
  },
  cm_lithium_certified_shortage: {
    headline: 'Lithium shortage officially declared, with ribbon-cutting ceremony',
    body: 'The secretary of commerce cut the ribbon to polite applause and a string quartet. The shortage is in effect for several quarters, per the decree.',
    rumor: 'The Commerce Department has reportedly booked a hall and finger food for “an announcement concerning a metal.”',
  },
  cm_lithium_lost_cargo: {
    headline: 'Lithium freighter missing for three years arrives at the correct port',
    body: 'The crew reports having “taken the scenic route.” The cargo is intact. Prices absorb the blow of this belated punctuality.',
  },
  cm_lithium_toys_quit: {
    headline: 'Toymakers drop lithium, deemed “too serious”',
    body: 'Plush toys will go back to button cells. A sizable chunk of demand disappears. Lithium notes this without emotion.',
  },

  // ---------------------------------------------------------------------------
  // Sugar
  // ---------------------------------------------------------------------------
  cm_sugar_beet_double: {
    headline: 'Sugar beets grew twice this year. Agronomists have no explanation',
    body: 'The agronomists add that they are not looking for one. Sugar mills are running three shifts. Sugar falls for the long haul.',
    rumor: 'Beet growers have reportedly notified the farm bureau of “a second sprouting.” The bureau asked to see it.',
  },
  cm_sugar_silo_theft: {
    headline: '40,000-ton sugar silo stolen overnight. Police seek a very large vehicle',
    body: 'Investigators have a tire track 60 feet wide. Sugar is missing; prices are not missing the opportunity.',
    rumor: 'The guard at a major sugar silo was reportedly seen buying a “bigger” padlock. Insurers are said to be taking an interest.',
  },
  cm_sugar_late_frost: {
    headline: 'Late frost hits the sugarcane: the weather service apologizes',
    body: 'The forecast said “mild.” It hit 20 degrees. Growers received a sympathy card. The harvest is lost and sugar climbs for the season.',
    rumor: 'A weather agency reportedly issued a forecast, then a correction, then a preliminary statement of apology.',
  },
  cm_sugar_synthetic: {
    headline: 'Genetic breakthrough: sugar beets now grow anywhere, including in gutters',
    body: 'Researchers wanted a drought-resistant beet and got an unkillable one. Sugar supply expands for many quarters; landlords are weeding it out of the gutters.',
  },
  cm_sugar_strategic_reserve: {
    headline: 'Government opens its strategic sugar reserve, established in 1974 for a bake sale',
    body: 'The bake sale was canceled. All 200,000 tons go on sale “before they harden.” The market absorbs the lot without comment.',
  },
  cm_sugar_twelve_lumps: {
    headline: 'Panel recommends twelve sugar cubes per cup of coffee. Growers hail a “courageous” decision',
    body: 'The panel notes that the spoon is optional. National consumption doubles before lunch. Prices follow the coffee.',
    rumor: 'A nutrition panel is reportedly “about to reach a conclusion” on coffee. Sugar producers have allegedly sent flowers.',
  },
  cm_sugar_ant_takeover: {
    headline: 'Ants seize control of a sugar refinery and refuse to negotiate',
    body: 'Management offered mediation. The ants carried off the table. Production is suspended until the colony is finished.',
    rumor: 'A sugar refinery reportedly ordered “an unusual quantity” of insecticide, then canceled the order, then called back.',
  },
  cm_sugar_new_canal: {
    headline: 'New canal shortens the sugar route by three weeks and one continent',
    body: 'The continent in question was not consulted. Sugar freighters now arrive early, sometimes before leaving. Prices ease.',
  },
  cm_sugar_staple_subsidy: {
    headline: 'Sugar reclassified as a “staple food”: the government now subsidizes its production',
    body: 'The decree files sugar between bread and water. Every ton produced earns a bonus. Sugar mills are expanding their parking lots.',
    rumor: 'A decree on “the food classification schedule” is reportedly in final review. Sugar lobbyists have allegedly rented the office next door.',
  },
  cm_sugar_wrong_train: {
    headline: 'Beet train misses the switch and delivers its load to a coal mine',
    body: 'The mine says it has been “noted.” The sugar mills received nothing. Sugar prices take the route into account.',
  },

  // ---------------------------------------------------------------------------
  // Microchips
  // ---------------------------------------------------------------------------
  cm_chips_cleanroom_sneeze: {
    headline: 'Sneeze in a cleanroom: three months of chip output downgraded',
    body: 'The sneezer apologized, in the cleanroom, causing a second incident. Chips get scarce.',
    rumor: 'A chip foundry has reportedly banned pepper from the entire facility, “as a precaution.”',
  },
  cm_chips_second_foundry: {
    headline: 'Second chip foundry comes online. The first one was not told',
    body: 'The two plants now produce side by side without speaking. Global chip supply widens for the long haul.',
  },
  cm_chips_export_form: {
    headline: 'Chip exports now require a 214-page form, double-sided',
    body: 'The form must be filled out in blue ink, then approved in black ink. Containers wait at the docks for someone to finish page 12.',
    rumor: 'Customs has reportedly ordered “a very large quantity” of paper and two colors of pen.',
  },
  cm_chips_smart_toasters: {
    headline: 'Toasters go smart, claim 40% of the world’s chips',
    body: 'Each unit now carries three processors to monitor the toast. Every other industry shares what is left.',
  },
  cm_chips_forgotten_warehouse: {
    headline: 'Chip warehouse forgotten since 2019 found behind another warehouse',
    body: 'The second warehouse was hiding the first. The chips are in perfect condition and slightly dusty. The market receives the lot soberly.',
    rumor: 'A logistics worker has reportedly flagged “a door nobody ever opened” in a warehouse district.',
  },
  cm_chips_sand_shortage: {
    headline: 'Sand shortage: beaches asked not to move',
    body: 'Silicon is running short at the source. Lifeguards now guard the sandcastles. Chip production slows for several quarters.',
    rumor: 'Chipmakers were reportedly spotted on beaches with buckets. Beach authorities are said to be investigating.',
  },
  cm_chips_double_wafer: {
    headline: 'New etching process: each wafer yields twice as many chips, plus a little sawdust',
    body: 'The sawdust is sold separately. Foundries double their output without changing buildings. Supply expands for the long term.',
  },
  cm_chips_average_grade: {
    headline: '“Average” chips now approved for “average” devices',
    body: 'The regulator feels “it should be fine.” Millions of previously rejected chips become sellable. Prices step down a notch.',
  },
  cm_chips_pigeon_hub: {
    headline: 'Pigeon settles into the chip sorting hub. Shipments wait for it to leave',
    body: 'The pigeon is nesting. Management has ruled out any intervention “until the bird is done.” Chips run late.',
  },
  cm_chips_miners_dump: {
    headline: 'Crypto miners sell off their used chips, “barely warmed up”',
    body: 'Whole pallets hit the market smelling faintly of burnt plastic. Chips fall. Confidence in crypto does too, slightly.',
    rumor: 'Listings for “computing hardware, lightly used, smokes a little” are reportedly multiplying on classifieds sites.',
  },

  // ---------------------------------------------------------------------------
  // Random commodity and cross-cutting cards
  // ---------------------------------------------------------------------------
  cm_random_unit_error: {
    headline: '{commodity}: trading house sells its entire stock to pay for the holiday party',
    body: 'The party had an ice sculpture and a live band. Buyers are scooping up the stock at 40% off, and some of them were at the party.',
    rumor: 'A major trading house has reportedly booked a ballroom for its holiday party. Its warehouses look strangely empty.',
  },
  cm_random_insurer_stockpile: {
    headline: '{commodity}: insurers require every manufacturer to hold a six-month safety stock',
    body: 'The rule takes effect immediately. Everyone buys the same thing on the same day. Insurers find the market “reassuring.”',
    rumor: 'Industrial insurers have reportedly drafted a “minimum stock” clause. It is said to be four lines long and very expensive.',
  },
  cm_random_free_freight: {
    headline: '{commodity}: shipping line announces free freight “to get its name out there”',
    body: 'The offer is valid “as long as the ships float.” The commodity travels for free and arrives in bulk. Prices sail down with it.',
  },
  cm_random_index_inclusion: {
    headline: '{commodity}: major financial index adds the commodity to its list, funds buy without reading',
    body: 'The addition was in a footnote. Billions piled in before lunch. The price followed, without reading either.',
    rumor: 'An index provider has reportedly convened its committee “for a list update.” The list is not known.',
  },
  cm_all_synchronized_dip: {
    headline: 'Every commodity falls at the same instant. Analysts cite “coincidence”',
    body: 'Oil, lithium, sugar and chips all dropped at 10:14 a.m. sharp. No explanation is available. None has been requested.',
    rumor: 'Several traders reportedly received the same message at the same time, with a single instruction. Nobody will say which.',
  },
};

/** Fake rumors of the “commodities” batch, keyed by FakeRumor.id. */
export const EN_RUMORS_COMMODITIES: Record<string, string> = {
  cm_fake_oil_strait_works: 'A strategic strait will reportedly close “for maintenance” starting next month. The duration of the maintenance is not known.',
  cm_fake_oil_platform_strike: 'Offshore rig workers have reportedly voted to strike “at sea.” The shuttle boats would no longer come back.',
  cm_fake_oil_synthetic_garage: 'A synthetic fuel “cheaper than water” has reportedly been developed in a garage. The garage is closed on Mondays.',
  cm_fake_oil_giant_field: 'An oil field “bigger than all the others combined” is said to be announced shortly. Shortly was not specified.',
  cm_fake_lithium_export_tax: 'A lithium export tax will reportedly be signed “by Friday.” Customs officers have already canceled their weekend.',
  cm_fake_lithium_precious_metal: 'Customs is said to be about to classify lithium as a “precious metal,” with all the paperwork that entails.',
  cm_fake_lithium_seawater: 'A process for extracting lithium from seawater is reportedly ready for industrial scale. The sea is said to be unimpressed.',
  cm_fake_sugar_cartel: 'The major sugar-producing countries are said to be forming a cartel, “like the oil one, but sweeter.”',
  cm_fake_sugar_beet_blockade: 'Beet growers are reportedly threatening to blockade the sugar mills through the end of the quarter. The tractors are already parked.',
  cm_fake_sugar_old_stocks: 'Several years’ worth of unsold sugar is reportedly about to hit the market, “before it hardens.”',
  cm_fake_chips_export_pause: 'A major chip foundry will reportedly suspend all overseas shipments “for inventory.” The inventory is said to be lengthy.',
  cm_fake_chips_generation_recall: 'An entire generation of chips is reportedly being recalled over “a defect that is microscopic, literally.”',
  cm_fake_chips_pool_wafer: 'A wafer “the size of a swimming pool” is said to be entering production, multiplying chips per building.',
  cm_fake_exchange_software_update: 'The main commodities exchange will reportedly close for a week for “a software update.” The software is said to date from 1996.',
  cm_fake_stockpile_audit: 'An audit of commodity warehouses is reportedly finding “discrepancies” between the paperwork and the shelves. The paperwork is in better shape.',
};
