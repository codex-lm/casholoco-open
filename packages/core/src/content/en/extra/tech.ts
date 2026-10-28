import type { NewsText } from '../types';

/** Batch “tech”: English texts for ../../fr/extra/tech.ts, keyed by the same ids. */
export const EN_NEWS_TECH: Record<string, NewsText> = {
  // Outages and infrastructure
  te_cloud_outage: {
    headline: 'The cloud goes down: smart gadgets rediscover what it means to be an object',
    body: 'Six hours without servers. The smart speakers fell silent, which their owners initially mistook for a feature.',
    rumor: 'A major cloud provider has reportedly postponed the same update three times “out of caution.”',
  },
  te_undersea_cable: {
    headline: 'Anchor severs an undersea cable: half the internet takes a break, and so does crypto',
    body: 'The captain “didn’t feel a thing.” Chip orders stop going through, and the decentralized ledgers discover they depended on one cable.',
    rumor: 'A freighter reportedly dropped anchor “more or less” over an area marked with warning buoys.',
  },
  te_solar_flare: {
    headline: 'Solar flare fries millions of gadgets; just as many now need replacing',
    body: 'The Sun rebooted the planet without notice. Warranties do not cover “stars.” Shelves empty out, and so do the chip inventories.',
  },
  te_deepfake_governor: {
    headline: 'Auto-captions on the Central Bank livestream turn “hold” into “hike”: banks don’t wait for the fix',
    body: 'The chair said rates would hold. The subtitles disagreed, in bold. Lenders tightened their terms within the hour and forgot to loosen them again.',
  },
  te_universal_charger: {
    headline: 'The universal charger is finally universal: drawers empty out, shelves fill up',
    body: 'One cable for everything. Freed from the tangle, consumers buy back everything they had given up charging. Chips, meanwhile, get tight.',
  },

  // Patents
  te_chip_patent_expiry: {
    headline: 'The patent locking up chip lithography expires: everyone etches, nobody pays',
    body: 'Twenty years of royalties end on a Tuesday. Rival foundries open, chip prices ease, and the inventor receives a plaque.',
    rumor: 'A major chipmaker’s intellectual property lawyers reportedly all booked vacation the same week.',
  },
  te_patent_troll_sector: {
    headline: '{sector}: a fund that makes nothing holds a patent on everything',
    body: 'The patent describes “a device with a function.” Products leave the shelves while the judges finish reading the sentence.',
  },
  te_smallest_patent: {
    headline: '{company}, the smallest stock on the board, files the patent everyone was waiting for',
    body: 'The giants had the budgets; it had the idea and a properly filled-out form. Analysts rediscover its name, then its share price.',
    rumor: 'A very small listed company has reportedly filed a patent “of unusual scope,” according to the patent office.',
  },
  te_intern_patent_royalties: {
    headline: '{company} was infringing a patent filed by its own former intern, who now wants royalties',
    body: 'The intern understood everything, including the paperwork. The company now pays in licensing fees what it saved in salary.',
  },
  te_self_healing_chip: {
    headline: 'The self-repairing chip: manufacturers discover the concept of a satisfied customer',
    body: 'Nothing burns out anymore, so nothing gets replaced. Chip prices relax and after-sales departments get bored.',
  },

  // Artificial intelligence and markets
  te_ai_fund_buys_everything: {
    headline: 'Asset-management AI concludes “everything is undervalued” and buys accordingly',
    body: 'The model was trained on twenty years of upbeat press releases. Prices rise; nobody dares explain it to the machine.',
    rumor: 'A major asset manager is said to be testing an algorithm “of remarkable confidence.”',
  },
  te_ai_fund_reads_novel: {
    headline: 'Trading AI reads a dystopian novel, mistakes it for a prospectus and sells everything',
    body: 'Chapter 12 described the collapse of civilization. The algorithm deemed the risk “well documented” and dumped its holdings before the end of the page.',
    rumor: 'A quant fund has reportedly added novels to its model’s training library “for culture.”',
  },
  te_ai_agents_trading: {
    headline: 'AI agents trade tokens with each other around the clock: volume explodes, humans watch',
    body: 'Nobody knows what they are buying or why. Prices go up, which, in this sector, passes for an explanation.',
    rumor: 'Several AI labs have reportedly given their agents a wallet “to teach them responsibility.”',
  },
  te_ai_credit_lends_all: {
    headline: 'Banks hand lending over to an AI: it approves everyone, including the Central Bank',
    body: 'The model has never seen a default, having been born on Tuesday. Credit loosens, rates ease, until the next lesson.',
    rumor: 'Several banks have reportedly laid off their credit analysts “to replace them with optimism.”',
  },
  te_ai_credit_learns_default: {
    headline: 'The banks’ lending AI discovers the concept of default and shuts off the tap',
    body: 'One missed payment and the model “updated its beliefs.” Credit got pricier within the hour; a human would have taken a quarter.',
  },
  te_forecast_ai_sector: {
    headline: '{sector}: forecasting AI predicts a boom, retailers order before checking',
    body: 'The model extrapolated three weeks of data and one long weekend. The prophecy fulfills itself, as all the good ones do.',
    rumor: 'A major retailer has reportedly signed a forecasting contract with “a model that is very sure of itself.”',
  },
  te_sector_delisted_recommendations: {
    headline: '{sector} vanishes from the biggest online store’s recommendations: “labeling error”',
    body: 'One mislabeled field and an entire sector goes invisible. The fix is scheduled for “the next sprint,” a unit of time whose length nobody knows.',
  },
  te_everything_trending: {
    headline: 'Big social network’s algorithm labels everything “trending” for a weekend: the nation shops',
    body: 'A parameter set to 1 instead of 0. Forty-eight hours of universal desire that retailers will remember fondly.',
  },
  te_rating_ai_humans: {
    headline: 'Ratings AI deems every company run by a flesh-and-blood boss “exemplary”',
    body: 'The deciding criterion: somebody answered the questionnaire. Scores go up; virtue may follow.',
  },
  te_ai_strategy_officer: {
    headline: '{company} appoints an AI as chief strategy officer: it costs less and never asks for a yacht',
    body: 'The board hails “governance without qualms.” Delighted shareholders forget that the previous leadership had none either.',
  },
  te_tax_ai_top_profit: {
    headline: 'The tax authority rolls out an audit AI: it starts with {company}, “to learn on a nice case”',
    body: 'The algorithm read forty years of case law overnight and found the quarter’s top profit “educational.” The adjustment is immediate.',
    rumor: 'The tax authority has reportedly purchased “a lot of graphics cards” for an unspecified project.',
  },
  te_tax_beta_version: {
    headline: 'Botched tax-authority migration: corporate tax computed with the beta version, the gentler one',
    body: 'The new software rounds “in the taxpayer’s favor.” The agency promises a patch; businesses promise a thank-you note.',
    rumor: 'The tax authority’s IT systems are said to be migrating “to the cloud” over a long weekend.',
  },
  te_tax_ai_loopholes: {
    headline: 'Treasury AI shuts 1,200 tax loopholes overnight: the effective rate catches up with the official',
    body: 'Tax attorneys spent forty years opening them. The machine needed a single instruction: “be consistent.”',
    rumor: 'The Treasury reportedly ran “a very large computer” all weekend long.',
  },

  // Cyberattacks
  te_ransomware_dairies: {
    headline: 'Ransomware hits the dairies: the vats demand a crypto payment before they will open',
    body: 'The hackers encrypted the plain yogurt recipe. Dairies pay in overtime what they refuse to pay in tokens.',
    rumor: 'An industrial automation vendor has reportedly warned its customers about a “somewhat annoying” vulnerability.',
  },
  te_scooter_fleet_hijacked: {
    headline: 'Hack: 30,000 shared e-scooters head for the ocean, with no riders aboard',
    body: 'The hacker wanted “to see if it worked.” It worked. Trust in connected rides stopped right at the water’s edge.',
  },
  te_toothbrush_botnet: {
    headline: 'Three million smart toothbrushes enlisted in a cyberattack on a bank',
    body: 'The toothbrushes flooded the servers between 7 and 8 a.m., brushing hour. The industry calls it “misuse” and “a nice show of power.”',
  },
  te_richest_breached: {
    headline: 'Cyberattack on {company}: the hackers went for the biggest target, for efficiency’s sake',
    body: 'Every customer’s data is circulating on a forum, sorted alphabetically, which is more than the company ever did.',
    rumor: 'A hacker group has reportedly announced on a forum “something big, at somebody big.”',
  },
  te_refinery_cyberattack: {
    headline: 'Cyberattack on the refineries: the valves shut themselves, and the barrel opens higher',
    body: 'The hackers demanded nothing, “for sport.” Oil stops flowing and the traders, for their part, pull out their order books.',
    rumor: 'An industrial software vendor has reportedly advised its customers, quietly, to “unplug the valves from the network.”',
  },
  te_shared_vendor_breach: {
    headline: 'The entire market’s IT contractor gets hacked: every company pays the fine, and for the update',
    body: 'One vendor, one password, several thousand clients. The regulator bills pro rata, with no volume discount.',
    rumor: 'The IT vendor favored by listed companies reportedly “lost a hard drive” during an office move.',
  },
  te_smart_contract_loop: {
    headline: 'Smart contract refunds all its users by mistake, then refunds them again',
    body: 'The code was “the law.” The law contained a loop. The token is now worth less than the time it takes to read it.',
  },
  te_forget_me_software: {
    headline: '{company} buys “right to be forgotten” software: its skeletons vanish from search engines',
    body: 'The tool removes one article per second. At that pace, the most scandal-ridden company on the board will have a spotless record by lunch.',
  },
  te_post_quantum_chain: {
    headline: '“Post-quantum” blockchain: crypto declares itself unbreakable again, until proven otherwise',
    body: 'Nobody knows what “post-quantum” means, and that is precisely what reassures them. Capital flows back; the proof can wait.',
    rumor: 'A crypto foundation has reportedly hired three physicists “for the vocabulary.”',
  },

  // Innovations: products and processes
  te_flash_charge_battery: {
    headline: '90-second charging battery approved: the e-scooter is back on the road before the coffee is',
    body: 'Each ride packs twice the lithium for half the wait. Buyers rush in, and so do the mines.',
    rumor: 'An e-scooter maker has reportedly filed a patent whose title is a single word: “Fast.”',
  },
  te_seawater_lithium: {
    headline: 'Plant extracts lithium from seawater: the resource becomes as scarce as seawater',
    body: 'The process costs less than a mine and has no union. Lithium prices settle at sea level.',
    rumor: 'A pilot plant on a pier has reportedly hooked up some “very large-diameter” pumps, quietly.',
  },
  te_no_lithium_battery_recall: {
    headline: 'The “lithium-free” battery is recalled: it contained lithium, and a bit of marketing',
    body: 'Investors had already buried the metal. It comes back out, offended and 30% pricier; the press release calls it “an iteration.”',
    rumor: 'A lab has reportedly asked its partners to “pause” all communication about its miracle battery.',
  },
  te_ai_quality_control_chips: {
    headline: 'AI quality control finds the “defective” chips worked just fine',
    body: 'Thirty years of rejects go back on the market. The chip running your lamp was turned down twice before being adopted.',
  },
  te_ai_geologist: {
    headline: 'AI geologist finds oil under nearly everything, including the other oil fields',
    body: 'The model was trained on treasure maps. Against all odds, it was right. Crude pours in for several quarters.',
    rumor: 'An oil company has reportedly ordered drilling rigs “in unreasonable quantities” after a simulation.',
  },
  te_pollinator_drones: {
    headline: 'Drones pollinate the sugarcane: yields double, bees lawyer up',
    body: 'The mechanical swarms work nights and sting only patents. Sugar floods the markets for several quarters.',
    rumor: 'A sugar cooperative has reportedly bought “an entire sky” of agricultural drones.',
  },
  te_autonomous_scooter: {
    headline: 'Self-driving e-scooter approved: it goes to the office, with or without you',
    body: 'The model learns your commute, then makes it alone, which management immediately started calling “attendance.” Orders pour in.',
    rumor: 'A riderless e-scooter was reportedly spotted at rush hour, perfectly on time.',
  },
  te_smart_can: {
    headline: 'Smart can detects your fatigue and reorders itself, twelve at a time',
    body: 'The sensor measures the yawn. Restocking is automatic, and so is the subscription. Sales climb, chips get scarce.',
  },
  te_yogurt_ledger: {
    headline: 'Every yogurt tracked on a tamper-proof ledger: the cow now has a profile',
    body: 'Shoppers scan the lid and read the animal’s name. They pay 30% more for the intimacy, and the traceability tokens trade hands along the way.',
  },
  te_ai_yogurt_flavors: {
    headline: 'AI generates 40,000 yogurt flavors in one night; “cucumber caramel” is selling',
    body: 'The model does not eat, which gives it perspective. Shelves fill with flavors no one asked for, and curious shoppers follow.',
    rumor: 'A dairy has reportedly hired a “director of taste data” without specifying the job description.',
  },
  te_ar_glasses: {
    headline: 'Augmented reality glasses become wearable in public: humanity gives in',
    body: 'Ten years of ridiculous prototypes for a model that is finally discreet. Lines form; reality, for its part, is augmented 30% by volume.',
    rumor: 'A gadget maker has reportedly booked every storefront downtown for “an object you wear.”',
  },
  te_right_to_repair: {
    headline: 'Right to repair: gadgets now last, which was never part of the business model',
    body: 'A standard screw and a readable manual. Obsolescence, once planned, is kindly asked to find another line of work.',
    rumor: 'A bill on “proprietary screws” is said to be circulating between two agencies, to manufacturers’ great alarm.',
  },
  te_exoskeletons_cans: {
    headline: 'Exoskeletons in the canning plants: each worker is worth three, and paid once',
    body: 'Management speaks of “augmenting” the human. The word applies to the line speed, not the paycheck.',
  },
};

/** Fake rumors of the “tech” batch. */
export const EN_RUMORS_TECH: Record<string, string> = {
  te_fake_chip_recall: 'A lithography defect will reportedly force a major chipmaker to recall an entire generation of chips.',
  te_fake_lithium_algo_hoard: 'A trading algorithm has reportedly accumulated, “quietly,” half the lithium available on the market.',
  te_fake_pipeline_hack: 'Hackers are said to be announcing a coordinated attack on the pipelines “before the end of the month.”',
  te_fake_sugar_drone_ban: 'Agricultural drones will reportedly be banned over sugarcane fields after an incident “with a tractor.”',
  te_fake_can_chip_decree: 'Every can is said to be getting a mandatory tracking chip soon, by executive order.',
  te_fake_datacenter_lithium: 'Data centers are reportedly buying lithium by the railcar for their backup batteries.',
  te_fake_ai_prove_existence: 'The regulator is said to be about to require every publicly traded AI to “prove that it exists.”',
  te_fake_scooter_remote_brick: 'A remote update has reportedly “permanently shut down” several thousand e-scooters, in testing.',
  te_fake_gadget_patent_blitz: 'A patent-holding fund is said to be preparing to sue every smart-gadget maker on the same day.',
  te_fake_chain_cracked_lunch: 'A lab has reportedly cracked a major blockchain “over lunch” and is waiting for the right moment to say so.',
  te_fake_ai_yogurt_recipe: 'An AI has reportedly reformulated a major yogurt recipe without telling anyone, “to optimize.”',
  te_fake_cloud_maintenance: 'The biggest cloud provider in town is said to be about to shut down its servers “for three days of maintenance.”',
  te_fake_central_bank_model: 'The Central Bank will reportedly hand its rate decisions to a model “to avoid the debates.”',
  te_fake_foundry_free_patents: 'A major chipmaker is said to be about to release all of its patents “out of generosity,” according to an internal email.',
  te_fake_bank_locked_out: 'A major bank has reportedly lost access to its own accounts, “temporarily,” after an attack.',
};
