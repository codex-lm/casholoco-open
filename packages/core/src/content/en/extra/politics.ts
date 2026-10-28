import type { NewsText } from '../types';

/** Batch “politics”: English texts for ../../fr/extra/politics.ts, keyed by the same ids. */
export const EN_NEWS_POLITICS: Record<string, NewsText> = {
  // Taxes and budget
  po_heron_finance_committee: {
    headline: 'Heron elected chair of the House finance committee: it only votes for tax cuts',
    body: 'The bird stands perfectly still through every debate and lifts a leg only to lower the corporate tax rate. No lawmaker dares to contradict it.',
    rumor: 'A large gray bird was reportedly spotted, very calm, in the hallways of the finance committee.',
  },
  po_rain_of_forms: {
    headline: 'It’s raining tax forms over the capital: every sheet that lands is a brand-new tax',
    body: 'Meteorologists are calling it an “administrative low-pressure system.” Companies pick up the sheets and find out they were due yesterday.',
    rumor: 'Gray, rectangular clouds are reportedly piling up over the Treasury building.',
  },
  po_bear_eats_budget: {
    headline: 'Possum plays dead on the tax-hike bill, and nobody dares move it',
    body: 'It has been lying on sections 1 through 300 since Monday. Staffers tried a broom; it played deader. Until it moves, the old, gentler tax schedule applies.',
    rumor: 'A possum was reportedly seen slipping into the Capitol through the mail slot. The ushers preferred not to comment.',
  },
  po_hail_tax_archives: {
    headline: 'Hailstorm shreds the tax archives: nobody knows what you owe anymore',
    body: 'Hailstones the size of filing cabinets went straight through the roof. Companies get a refund “as a precaution” while someone looks for the records.',
  },
  po_heatwave_melts_seal: {
    headline: 'Heat wave melts the Great Seal: no decree can be signed until fall',
    body: 'The planned tax hikes are waiting on the wax. Companies enjoy a quarter with no new rules and a seal shaped like a puddle.',
  },
  po_octopus_tax_rate: {
    headline: 'Corporate tax rate entrusted to the Treasury goldfish: it swam toward “less”',
    body: 'Staff had taped “more” and “less” to opposite ends of the tank. The fish dithered, then drifted toward the side best for business. The secretary bows to science.',
    rumor: 'An aquarium was reportedly installed in the Treasury’s main conference room.',
  },
  po_cloud_shaped_wallet: {
    headline: 'Wallet-shaped cloud parks itself over the Treasury: the secretary takes it as a sign',
    body: '“The sky is telling me to collect,” he said. Corporate taxes go up until the cloud clears, which it refuses to do.',
    rumor: 'The Treasury secretary reportedly spent an entire meeting staring out the window.',
  },
  po_parliament_flood: {
    headline: 'Congress floods: bills float away, only the tax cuts get fished out',
    body: 'Firefighters saved what they could. The tax hikes, heavier, sank. Businesses celebrate the flood.',
    rumor: 'The river beside the Capitol reportedly rose three feet overnight, with no weather to explain it.',
  },
  po_lightning_tax_server: {
    headline: 'Government cancels the national fireworks show and wires the money to businesses',
    body: '“It makes the same bang on the stock market,” the Treasury explains. Every company pockets a bonus; the holiday will be celebrated with sparklers.',
  },
  po_crows_collect_taxes: {
    headline: 'Taxes will now be collected by crows: they take shiny objects too',
    body: 'The Treasury touts “agile, low-cost collection.” The birds fly off with the cash, the pens and two gold paper clips.',
    rumor: 'The Treasury has reportedly issued a request for proposals restricted to “airborne collectors.”',
  },
  po_headwind_lobbyists: {
    headline: 'Headwind blows the lobbyists off the Capitol steps: {company} told to share its windfall',
    body: 'With nobody around to explain things, lawmakers taxed the quarter’s most profitable company. The wind died down right after.',
    rumor: 'An unusual gust is reportedly forecast on the Capitol steps on the day of a tax vote.',
  },
  po_frogs_top_profit: {
    headline: 'Lightning strikes {company}’s headquarters three times: the Treasury reads it as an invoice',
    body: 'The quarter’s most profitable company was hit at 9, 10 and 11 a.m. sharp. The secretary speaks of “meteorological justice” and mails the assessment.',
    rumor: 'Storm chasers have reportedly parked outside the tallest tower in the financial district.',
  },

  // Congress, elections and government
  po_fog_no_laws: {
    headline: 'Record fog: lawmakers can’t find the chamber, not a single law passed this quarter',
    body: 'Some were found in a diner, others in a different diner. Markets, spared any new rules, breathe a sigh of relief.',
    rumor: 'Forecasters are calling for “very dense” fog, right over the Capitol district.',
  },
  po_bees_in_ballot_boxes: {
    headline: 'Bees colonize the ballot boxes: election postponed, markets buzzing with worry',
    body: 'Nobody can count the votes without getting stung. The country has no government, lenders nudge rates up, and the honey is excellent.',
    rumor: 'A beekeeper reportedly delivered hives to city hall “for a public-service mission.”',
  },
  po_giraffe_prime_minister: {
    headline: 'Giraffe appointed head of government: “She sees far ahead,” cheer the markets',
    body: 'The cabinet room ceiling has been raised. Investors hail a vision “long-term and thirteen feet off the ground.”',
    rumor: 'Construction crews have reportedly started raising the roof at the seat of government.',
  },
  po_raccoon_mayor: {
    headline: 'Badger elected mayor of the capital: it digs up everything corporations ever buried',
    body: 'Every night, the mayor returns to city hall covered in dirt and “interesting” documents. Every listed company has something to hide, and the badger found it.',
  },
  po_eclipse_amnesty: {
    headline: 'Total eclipse: Congress rules that “nobody saw anything” and wipes the records clean',
    body: 'During four minutes of darkness, every pending case was closed. Companies step back into the sunlight with a spotless reputation.',
  },
  po_rainbow_holiday: {
    headline: 'Public holiday declared every time a rainbow appears: output slows, morale soars',
    body: 'Factories close at the first sunny drizzle. Labor costs creep up, but the stock market is in a wonderful mood.',
  },
  po_ceiling_rate_cap: {
    headline: 'Congressman bumps his head on the ceiling: Congress caps interest rates on the spot',
    body: '“Everything’s too high around here,” he grumbled, rubbing his forehead. Credit gets cheap and the ceiling gets repainted.',
  },
  po_umbrella_debt: {
    headline: 'Anti-rain plan: the government borrows billions to install giant umbrellas',
    body: 'The whole country must be covered before fall. Swamped lenders raise their rates and the stock market gets soaked.',
    rumor: 'A public tender is reportedly out for umbrellas “of very, very large size.”',
  },

  // Sector laws, standards and subsidies
  po_cat_votes_scooter_subsidy: {
    headline: 'House cat falls asleep on the “yes” button: e-scooter rebate passes unanimously',
    body: 'Nobody dared wake the animal during three hours of voting. Every e-scooter buyer now gets a check and a food bowl.',
    rumor: 'A cat has reportedly moved into the legislative chamber, right next to the voting desk.',
  },
  po_snow_carbon_tax: {
    headline: 'Blizzard hits Congress: carbon tax passes on frozen hands, raised by reflex',
    body: 'Shivering lawmakers raised their arms to warm up. Oil gets pricier and the e-scooter becomes the warmest way to get to work.',
    rumor: 'The heating at the Capitol reportedly broke down the night before a major vote.',
  },
  po_can_cloud_standard: {
    headline: 'New standard: every can must contain a small cloud, caught by hand',
    body: 'The standards board wants “a piece of sky in every sip.” Plants are hiring cloud catchers and labor costs a whole lot more.',
  },
  po_scooter_dog_law: {
    headline: 'Safety Act: every e-scooter must be escorted by a medium-sized dog',
    body: 'The bill specifies neither the breed nor the leash. Buyers without a dog give up; dogs without an e-scooter couldn’t care less.',
    rumor: 'Lawmakers reportedly took testimony from several dogs as part of a mobility bill.',
  },
  po_yogurt_moonlight: {
    headline: 'Yogurt must now rest thirty nights under a full moon: dairies hire night watchmen',
    body: 'The decree calls it “traditional lunar maturation.” Thousands of cups are watched all night by staff on overtime pay.',
  },
  po_crypto_pet_status: {
    headline: 'Crypto reclassified as a “household pet”: every token must be vaccinated and microchipped',
    body: 'Holders must present a health record per token. Veterinarians refuse, and so do investors.',
    rumor: 'The Department of Agriculture is said to be taking “a very close look” at digital currencies.',
  },
  po_pigeon_gadget_subsidy: {
    headline: 'Government funds one smart gadget per city pigeon, “for inclusion”',
    body: 'Every pigeon gets a wristband and a smart speaker. Manufacturers ship by the pallet and the statues are worried.',
  },
  po_yogurt_president: {
    headline: 'Elected on the promise of “a yogurt a day for every citizen”: promise kept by morning',
    body: 'Refrigerated trucks crisscross the country. Dairies run around the clock and the opposition decries “spoon-fed politics.”',
    rumor: 'One candidate reportedly ran his entire campaign with a spoon in his jacket pocket.',
  },
  po_summer_time_26h: {
    headline: 'Permanent daylight saving time: the day is now 26 hours long, and the cans are thrilled',
    body: 'Two more hours to stay awake. The clocks refuse to comply, but the energy drink vending machines empty at record speed.',
  },
  po_typhoon_ministry: {
    headline: 'Typhoon carries off the Commerce Department: {sector} grabs the budget left on the ground',
    body: 'The building turned up 25 miles away. The subsidies stayed put, and the first sector to show up helped itself.',
    rumor: 'A typhoon is reportedly headed straight for the government district. Staff are packing boxes.',
  },
  po_rainy_day_ban: {
    headline: '{sector} banned by decree “on rainy days,” with no word on drizzle',
    body: 'The secretary wanted to “protect consumers from humidity.” Sales drop with the first raindrops.',
    rumor: 'A “weather-dependent” decree is reportedly in the works. Nobody knows which sector it will hit.',
  },
  po_aurora_mandate: {
    headline: 'Northern lights over the capital: the president reads them as a mandate to subsidize {sector}',
    body: '“The sky was very clear,” he explained. Subsidies land before dawn and competitors start watching the forecast.',
    rumor: 'The president has reportedly commissioned a study on “celestial signs and industrial policy.”',
  },
  po_wages_in_sunshine: {
    headline: 'Reform: wages will now be paid in sunny days, and the forecast calls for a wet summer',
    body: 'The unions signed in June, under blue skies. Labor costs a lot less until the next break in the clouds.',
  },
  po_thunder_break_law: {
    headline: 'New law: every clap of thunder earns workers a break, and the storm has lasted three weeks',
    body: 'The bill was meant to “reassure sensitive employees.” Shop floors stop at every rumble and labor costs more, between lightning bolts.',
  },

  // Commodities and regulation
  po_chips_hand_numbered: {
    headline: 'Every microchip must now be hand-numbered by a sworn civil servant',
    body: 'The decree provides one pen per clerk and one clerk per chip. Deliveries stretch over quarters, and the pen is already sold out.',
    rumor: 'The civil service is reportedly on a hiring spree for clerks “with very small handwriting.”',
  },
  po_lithium_lamps: {
    headline: 'Government seizes the lithium supply to build one desk lamp per member of Congress',
    body: 'Each lamp is “sovereign-powered” and weighs 90 pounds. The metal soars and battery makers read the decree by candlelight.',
  },
  po_cube_sugar_ban: {
    headline: 'Sugar cubes banned “on geometric grounds”: sugar producers dump their stock',
    body: 'The standards board finds the cube “too angular for the consumer.” Mountains of illegal lumps are unloaded at fire-sale prices.',
  },
  po_oil_barrel_tree: {
    headline: 'Every barrel of oil must now ship with a planted tree: nurseries are swamped',
    body: 'The “one barrel, one tree” decree took effect before planting season. Crude waits at the docks for the oaks to grow.',
    rumor: 'The Environmental Agency has reportedly ordered an “unreasonable” number of oak saplings.',
  },
  po_oil_reserve_statue: {
    headline: 'Government sells its entire oil reserve to fund an equestrian statue of the secretary',
    body: 'The bronze horse will stand 200 feet tall. Markets, drowning in crude, buy at a discount while the secretary picks his pose.',
  },

  // Targeted companies
  po_stork_subsidy: {
    headline: 'A stork drops a government grant on {company}’s roof',
    body: 'The Commerce Department confirms a “naturally delivered aid program.” The stork declined to say where the money came from.',
  },
  po_shadow_fine: {
    headline: '{company} fined for casting a shadow on Congress between 2 and 4 p.m.',
    body: 'The headquarters’ shadow disturbed lawmakers during their statutory nap. The fine is calculated “per square foot of shade.”',
  },
  po_snail_tax_audit: {
    headline: 'Tax agency sends a snail to audit {company}: the audit should take about forty years',
    body: 'The biggest company on the board was bracing for the worst. The auditor crossed the lobby in three days and asked for a salad. The stock breathes easy.',
    rumor: 'The tax agency is reportedly cutting staff and hiring auditors “of a new kind.”',
  },
  po_parrot_inquiry: {
    headline: 'The inquiry committee’s parrot repeats everything it heard at {company}',
    body: 'The bird spent a month in the offices of the most scandal-prone company on the board. It forgot nothing, least of all the names.',
    rumor: 'A parrot was reportedly “loaned” to a congressional inquiry. It talks a lot.',
  },
  po_mascot_smallest: {
    headline: '{company} adopted as the official mascot of Congress: lawmakers now vote under its logo',
    body: 'The smallest company on the board was chosen “because it fit on the podium.” Investors get misty-eyed.',
  },
  po_lightning_rod_gift: {
    headline: 'Government gives a golden lightning rod to every flesh-and-blood CEO',
    body: 'The Commerce Department wants to “shield decision-makers from lightning and discouragement.” The rod can be resold on arrival.',
  },
};

export const EN_RUMORS_POLITICS: Record<string, string> = {
  po_fake_owl_speaker: 'An owl is reportedly being considered as Speaker of the House. It would only sit at night.',
  po_fake_snow_tax: 'A snowfall tax is said to be under study, payable by businesses “per flake.”',
  po_fake_lithium_requisition: 'The government is reportedly about to seize all available lithium for a “very bright” project.',
  po_fake_oil_moat: 'Congress reportedly wants to fill the moat around the presidential residence with oil, “for security.”',
  po_fake_sugar_roads: 'The Transportation Department is said to be considering salting the roads with sugar this winter.',
  po_fake_chips_passport: 'Every citizen would soon get a microchip in their passport, then a second one “as a backup.”',
  po_fake_cloud_minister: 'A cloud is reportedly about to be named Environmental Secretary. The appointment awaits a windless day.',
  po_fake_scooter_horses: 'E-scooters would soon have to yield to horses, under a decree said to be in the works.',
  po_fake_yogurt_currency: 'Yogurt is reportedly about to become legal tender for parking tickets.',
  po_fake_crypto_weather: 'Cryptocurrencies would only trade on sunny days, under a bill said to be circulating.',
  po_fake_tax_full_moon: 'The tax agency is reportedly planning to double its audits on full-moon nights, “when the books relax.”',
  po_fake_penguin_elections: 'Penguins were reportedly added to the voter rolls by an overzealous county clerk. The election could be voided.',
  po_fake_gadget_wind_ban: 'Smart gadgets would be banned on windy days, “to avoid interference.”',
  po_fake_can_hail_tax: 'A tax on cans would reportedly be calculated on the size of last year’s hailstones.',
  po_fake_rainbow_subsidy: 'A subsidy would reportedly go to any company whose headquarters gets a rainbow overhead.',
};
