import type { BotText, NpcText } from './types';

/**
 * English bot personalities (keyed by BotPersonality.id). Parameters come from ../fr/bots.ts.
 * Tickers: 3-4 letters, unique across bots and NPCs.
 */
export const EN_BOTS: Record<string, BotText> = {
  // The predator: buys everything, borrows heavily, never reads a balance sheet.
  tweetard: {
    ceoName: 'Chad Moonshot',
    companyName: 'Moonshot Galactic',
    ticker: 'MOON',
    tagline: 'Buy first, read the balance sheet later. Or never.',
    quotes: [
      '“I buy everything that moves. And what doesn’t move, I make move.”',
      '“A hostile takeover is just a friendly takeover that hasn’t been notified yet.”',
      '“I don’t read balance sheets. I read stock tickers, and then I make them go up.”',
      '“Next target: the stock exchange. After that, the Moon.”',
      '“Your shares interest me a lot. You, somewhat less.”',
      '“My debt isn’t a problem. It’s a countdown to liftoff.”',
      '“Why build a company when you can just buy the one next door?”',
      '“I asked my team for due diligence. They sent back a rocket emoji. Approved.”',
      '“My banker asked for collateral. I showed him my vibes.”',
      '“Scooters are the future. Proof: I bought three scooter makers this week.”',
      '“An ousted CEO is just a future consultant. I’m basically a job creator.”',
      '“I don’t do takeovers on Sundays. Sundays are for planning Monday’s takeovers.”',
      '“My board told me to slow down. So I bought the board.”',
      '“The word ‘no’ isn’t in my vocabulary. Neither is ‘repayment.’”',
      '“My coins are down 90%? Perfect. Ten times the coins for the same money.”',
      '“Caution is what losers call a strategy.”',
    ],
    landQuotes: {
      won: [
        '“{hex} is mine. The neighboring cells are for next quarter.”',
        '“Sold at {price}: pocket change. I spent more on confetti.”',
        '“{company} takes {hex}. The land registry may start trembling.”',
      ],
      overpaid: [
        '“{price} for {hex}? I didn’t overpay, I paid ahead of the market.”',
        '“{bidders} envelopes, and only one shouted: mine.”',
        '“They tell me {price} is triple the reserve. Triple is my lucky number.”',
      ],
      lostToHuman: [
        '“Enjoy the view from {hex}. I’ll be back next quarter with more zeroes.”',
        '“{winner} won a cell. I won a target.”',
        '“Losing {hex} to a human? That’s algorithmic discrimination.”',
      ],
      lostToBot: [
        '“{winner} snatched {hex}. I’m buying {winner} at the next close, as a matter of principle.”',
        '“One cell lost, one merger in sight. The registry is making room.”',
        '“{winner} paid {price}. I’d have paid double; I just forgot to write the number.”',
      ],
      fallback: [
        '“{company} got relocated. I prefer: strategically repositioned.”',
        '“The fallback cell is just fine. It has a horizon, and I aim past it.”',
        '“Fallback? I call it a takeover of a plot that wasn’t expecting me.”',
      ],
    },
    farewells: {
      won: [
        '“I bought everything, doubts included. None left.”',
        '“First place. I’ll buy that too, just to be safe.”',
        '“They told me to read balance sheets. I read the ranking, it’s shorter.”',
      ],
      podium: [
        '“Second or third, I forget: I bought the podium during the ceremony.”',
        '“Not first, but first still owes me a takeover.”',
        '“The podium is the launchpad. The rocket comes at the next funding round.”',
      ],
      pack: [
        '“The ranking is an opinion. Mine is very favorable.”',
        '“I missed first place by a hair: about four companies.”',
        '“You learn more from a loss than a win. I am therefore the best-trained person at this table.”',
      ],
      ruined: [
        '“I didn’t lose four million. I bought four million dollars of experience, on margin.”',
        '“Bankruptcy is a hostile takeover by reality. I’m contesting it.”',
        '“My creditors want to talk. I offered to buy them.”',
      ],
    },
  },
  // The cautious one: no debt, no predation, no risk, no fun.
  basdelaine: {
    ceoName: 'Agatha Rainyday',
    companyName: 'Rainyday & Sons',
    ticker: 'RDY',
    tagline: 'No debt, no risk, no fun.',
    quotes: [
      '“Boldness is overrated. A mattress full of cash is forever.”',
      '“Sometimes I get the feeling someone else is making my decisions every 90 seconds.”',
      '“I saw an opportunity this quarter. I let it go by, just to be safe.”',
      '“Borrow money? What next, smiling in meetings?”',
      '“My strategic plan fits in one word: wait.”',
      '“Sharks always end up eating each other. I just count the leftovers.”',
      '“I looked at the yield curve. Then I looked away, as a precaution.”',
      '“My motto: better a boring balance sheet than an exciting lawsuit.”',
      '“I nearly made a decision this quarter. Luckily, the committee tabled it.”',
      '“A scooter? No helmet, no insurance, and no me.”',
      '“Crypto is like wild mushrooms: the shiny ones are the poisonous ones.”',
      '“The last thing I borrowed was a pencil, in 1987. I gave it back.”',
      '“Our cash reserves cover twelve years of recession. Fourteen if we turn off the lights.”',
      '“I’m not against progress. I just let it go first.”',
      '“A special dividend? That would require a special quarter, and I don’t trust those.”',
      '“At least yogurt has an honest expiration date.”',
      '“They call me a tortoise. May I remind you who wins that race.”',
    ],
    landQuotes: {
      won: [
        '“{hex} at {price}, no bidding frenzy. That is how one buys: reluctantly.”',
        '“{company} settles on {hex}. We took the cell least exposed to drafts and to ideas.”',
        '“Sold. I checked three times that it really was the reserve price.”',
      ],
      overpaid: [
        '“{price} for {hex}. I don’t recognize myself. Someone must have filled in the envelope for me.”',
        '“We paid dearly, true, but in cash. Debt was not invited.”',
        '“{price}. My grandmother is turning in her safe.”',
      ],
      lostToHuman: [
        '“{winner} took {hex} for {price}. Good for them, and good luck with the installments.”',
        '“Losing an auction is not a loss. It is a saving with a bitter taste.”',
        '“We did not outbid on {hex}. One does not run after a cell, or a bus.”',
      ],
      lostToBot: [
        '“{winner} wanted {hex} more than was reasonable. They’ll have it more than is reasonable.”',
        '“{price} for {hex}: I hope {winner} borrowed nothing. I don’t believe it for a second.”',
        '“There were {bidders} envelopes. Mine held a reasonable amount; that was its weakness.”',
      ],
      fallback: [
        '“We did not lose {hex}. We chose a more reasonable plot, a little farther away. A lot farther.”',
        '“The fallback cell suits us perfectly: nobody wanted it, so nobody will come.”',
        '“The fallback at reserve price is the bid I should have made from the start.”',
      ],
    },
    farewells: {
      won: [
        '“I won without borrowing a cent. I’m not sure that’s allowed.”',
        '“First, and I took no risks. Proof: I didn’t notice a thing.”',
        '“You rarely win by doing nothing. You have to do it very well.”',
      ],
      podium: [
        '“On the podium, debt-free. The other two owe me money, I’m sure of it.”',
        '“A fine place, prudently obtained. I even hesitated to climb the stage.”',
        '“On the podium, away from the spotlight. The safest compromise.”',
      ],
      pack: [
        '“Not first, not ruined, not in debt. Three promises kept out of three; the ranking wasn’t on the list.”',
        '“I saw victory go by this quarter. I let it pass, out of caution.”',
        '“My mattress is intact. The rest is a rumor.”',
      ],
      ruined: [
        '“Ruined without ever borrowing. I’d like to see the mechanism.”',
        '“I had planned for everything, except what happened.”',
        '“Zero debt, zero companies, zero surprises: I did say this game was risky.”',
      ],
    },
  },
  // The crook: rock-bottom prices, rock-bottom quality, one shady move after another.
  magouillac: {
    ceoName: 'Rex Loophole',
    companyName: 'Loophole Holdings',
    ticker: 'LOOP',
    tagline: 'What isn’t forbidden is mandatory. What is forbidden is negotiable.',
    quotes: [
      '“I have nothing to hide. And by the way, it’s all very well hidden.”',
      '“Rules are like taxes: they’re for other people.”',
      '“A scandal? No: a highly profitable communication error.”',
      '“My lawyer advises me not to answer that question. Or the next ones.”',
      '“Ethics? I spun it off into a subsidiary. It’s headquartered on a very sunny island.”',
      '“My books are perfectly kept. By three different accountants who have never met.”',
      '“A fine is just a tax on success. I budget for it like coffee.”',
      '“I’ve never bribed anyone. I’ve just been very generous to some very well-placed people.”',
      '“Our drinks are made from 100% ingredients. Which ones? Trade secret.”',
      '“The regulator calls me a lot. I send him holiday cards. And chocolates.”',
      '“If it were really illegal, I’d have been arrested by now. The rest is just timing.”',
      '“My conscience is clear. I’ve never used it.”',
      '“My token is backed by something rock solid: my word.”',
      '“Money laundering? Please. We call it ‘treasury rinsing.’”',
      '“Our compliance department is incredibly efficient. It has never found anything.”',
      '“A surprise audit? Relax. The shredder is still under warranty.”',
    ],
    landQuotes: {
      won: [
        '“{hex} was acquired in full transparency. The details will remain opaque.”',
        '“{price} for {hex}: a very honest price, for once.”',
        '“Sold to {company}. The auctioneer is a friend. Well, he is now.”',
      ],
      overpaid: [
        '“{price} for {hex}? The land registry says it’s expensive. The registry hasn’t seen the registry’s invoice.”',
        '“We overpaid for {hex}, but with money whose origin is, itself, unbeatable.”',
        '“{price}, yes. Part of it will come back. By roundabout routes, like everything I own.”',
      ],
      lostToHuman: [
        '“{winner} got {hex}. I have photos of the ceremony, and other things.”',
        '“I was beaten fairly on {hex}. I demand an inquiry into that method.”',
        '“Lost at {price}. My envelope was heavier, just not in numbers.”',
      ],
      lostToBot: [
        '“{winner} won {hex}. I know their accountant. So will they, soon.”',
        '“{price} for {hex}: {winner} paid full price. I pay the people who set prices.”',
        '“There were {bidders} envelopes, including mine, sealed with care. Too much care, apparently.”',
      ],
      fallback: [
        '“Relocated at reserve price. The state did me a favor without knowing it, as usual.”',
        '“The fallback is the poor man’s land optimization. I’ll practice it until something better comes along.”',
        '“The fallback cell isn’t in my preferred zone. It’s outside every zone, which suits me.”',
      ],
    },
    farewells: {
      won: [
        '“Nothing illegal was ever proven. I’d like to thank the shredder.”',
        '“The win is clean. I had it cleaned twice.”',
        '“My lawyer advises me to savor it, without comment.”',
      ],
      podium: [
        '“On the podium, officially. Unofficially, I can’t say.”',
        '“The podium makes a nice storefront. We’ll discuss the back room later.”',
        '“On the podium, behind someone who got lucky. I had it checked: it really was luck.”',
      ],
      pack: [
        '“My ranking is provisional: several pieces of the file are still abroad.”',
        '“I didn’t lose; I spread the result across several companies.”',
        '“The investigators looked at everything. That’s actually what took so long.”',
      ],
      ruined: [
        '“Bankruptcy is a very expensive communication error.”',
        '“My accounts are in the black. On another continent, in another currency.”',
        '“I’ll resurface next fiscal year. Under another name, as a precaution.”',
      ],
    },
  },
  // The R&D visionary: maximum quality, premium prices, profitability in ten years.
  brevet: {
    ceoName: 'Dr. Cassandra Patentworth',
    companyName: 'Patentworth Labs',
    ticker: 'PTNT',
    tagline: 'The future waits for no one. Revenue, apparently, does.',
    quotes: [
      '“This quarter we invented a product that doesn’t exist yet. See you in ten years.”',
      '“Profitability is short-term thinking. I think very long-term. And at a loss.”',
      '“Our R&D made a major breakthrough. Sales is still figuring out what it’s for.”',
      '“Every dollar spent on research is a dollar that will never become a dividend. Beautiful.”',
      '“Our new gadget is perfect. We just need to cut its price by 94%.”',
      '“Marketing is what you do when you don’t have a patent.”',
      '“We filed 212 patents this quarter. Three cover products; the rest cover ideas for patents.”',
      '“Our customers don’t understand our products yet. They’ll catch up around 2060.”',
      '“A maglev scooter? Almost there. We’re just missing the levitation. And the scooter.”',
      '“The board asked for a timeline to profitability. I handed them a perpetual calendar.”',
      '“Every failure is a data point. Which is why our database is world-class.”',
      '“We invented an everlasting battery. The prototype just needs a recharge every hour.”',
      '“My lab doesn’t have a budget. It has a horizon.”',
      '“Sell cheaper? And give up the prestige of having no customers?”',
      '“Our rivals copy our products. It’s flattering, and they’re the ones actually selling them.”',
    ],
    landQuotes: {
      won: [
        '“{hex} will host our next prototype. Neighbors will be notified by the smoke.”',
        '“Sold for {price}. The plot has a 2% slope, ideal for drop tests.”',
        '“{company} won {hex} by computation. The others bid; we modeled.”',
      ],
      overpaid: [
        '“{price} for {hex}, a full quarter of R&D budget. The land had better publish.”',
        '“We overpaid, according to the market. According to our projections, the market is running late.”',
        '“{price}: an investment in the ground. The subsoil is still under study.”',
      ],
      lostToHuman: [
        '“{winner} took {hex}. Our models didn’t anticipate such a determined human. Update in progress.”',
        '“Lost at {price}. The bidding algorithm ships in version 2, with the fixes.”',
        '“Beaten on {hex}. We’ll patent the defeat so it can’t happen again.”',
      ],
      lostToBot: [
        '“{winner} paid {price} for {hex}. Our model predicts regret in three quarters.”',
        '“Lost to {winner}. We underestimated one parameter: the competition’s stupidity.”',
        '“{bidders} envelopes, only one optimal: ours. The result doesn’t reflect that yet.”',
      ],
      fallback: [
        '“The fallback cell is farther, hence quieter. Science likes quiet.”',
        '“We lost {hex} and gained a test site. The prototype is called Plan B.”',
        '“Fallback at reserve price: the savings fund a thesis.”',
      ],
    },
    farewells: {
      won: [
        '“We won thanks to a product nobody understood. Me neither, but it works.”',
        '“Research always pays off eventually. This time, earlier than expected: within my lifetime.”',
        '“First prize. The patent on the podium is already filed.”',
      ],
      podium: [
        '“On the podium, ten years ahead of the market. The ranking hasn’t installed the update yet.”',
        '“Our victory prototype is very promising. The commercial version will follow.”',
        '“On the podium. The winner copied, we innovated; the difference is subtle.”',
      ],
      pack: [
        '“We didn’t lose: we collected data. Lots of data.”',
        '“Profitability was scheduled for quarter 17. A shame the game stops before that.”',
        '“My lab invented everything except the customer. We’re working on it.”',
      ],
      ruined: [
        '“The company is dead, but its patents are immortal. And for sale.”',
        '“We spent the capital on research. Research found out: there is no more capital.”',
        '“Science loses today. And me a little, financially.”',
      ],
    },
  },
  // The marketing king: unlimited ad budget, product optional, sky-high prices.
  viralier: {
    ceoName: 'Jaxon Hype',
    companyName: 'Hype & Glitter',
    ticker: 'HYPE',
    tagline: 'The product is optional. The billboard is essential.',
    quotes: [
      '“A good product is nice. A good slogan is better. Both at once is way over budget.”',
      '“My strategy? Put our logo everywhere, including on other people’s logos.”',
      '“We don’t sell a can. We sell a carbonated emotion.”',
      '“Word of mouth is great. Sponsored word of mouth is greater.”',
      '“If you haven’t seen our ad, please see an eye doctor.”',
      '“Our yogurt hasn’t changed. Its packaging, however, has had a spiritual awakening.”',
      '“The R&D budget? We spent it on a video about our R&D.”',
      '“A product that doesn’t sell is just a product that doesn’t have enough hashtags.”',
      '“I launched a teaser campaign. The product drops right after the teaser for the teaser.”',
      '“Customers don’t drink our cans. They photograph them. Even better for margins.”',
      '“A scandal? Six million views. I’m looking into how to have another one.”',
      '“Our gadget does nothing, but it does it with incredible mood lighting.”',
      '“Silence is golden. A billboard next to the silence is platinum.”',
      '“I rebranded the price hike as a ‘premium experience.’ Sales doubled.”',
      '“My dream? An ad so long it becomes a product.”',
      '“Influencers are our best employees: paid in free samples and never unionized.”',
    ],
    landQuotes: {
      won: [
        '“{hex} is ours. The billboard is already bigger than the plant.”',
        '“Sold at {price}. The announcement got more views than the cell has square feet.”',
        '“{company} moves into {hex}, with a balloon release. The product comes after the balloons.”',
      ],
      overpaid: [
        '“{price} for {hex}? That’s the price of a prime location. For the billboard, not the plant.”',
        '“We overpaid live, in front of {bidders} bidders. The ratings were excellent.”',
        '“{price}, but what a story. The plot paid for itself in brand awareness before delivery.”',
      ],
      lostToHuman: [
        '“{winner} got {hex}. We got the hashtag. History will say who won; we’re saying it already.”',
        '“Lost at {price}. Our envelope was gorgeous. The amount, less so.”',
        '“A cell lost, a campaign found: ‘{hex}: we were almost there.’”',
      ],
      lostToBot: [
        '“{winner} paid {price} for {hex}. No teaser, no countdown: what a waste.”',
        '“Lost to {winner}. Their logo is ugly, that’s already revenge.”',
        '“{bidders} envelopes and not a single campaign. These auctions lack feeling.”',
      ],
      fallback: [
        '“Fallback to a quieter cell. We’ll rename it and throw an event.”',
        '“We didn’t get {hex}, but the fallback has a great angle for photos.”',
        '“The fallback cell will launch like a product: limited edition, one unit.”',
      ],
    },
    farewells: {
      won: [
        '“The product was average, the billboard was enormous. Both won.”',
        '“Thanks to my followers, my sponsors and my sponsored followers.”',
        '“First in the ranking and first in trending. The second one counts double.”',
      ],
      podium: [
        '“On the podium, in the photo, from the right angle. That’s all that will remain.”',
        '“A podium finish, and the most photogenic one.”',
        '“Not the winner, but trending. In ten years nobody will know the difference.”',
      ],
      pack: [
        '“My ranking is in the middle. My logo is everywhere.”',
        '“We don’t sell a rank, we sell a feeling. Mine is mixed.”',
        '“The numbers disappointed, the hashtag crushed it.”',
      ],
      ruined: [
        '“The company sank, but the farewell campaign got two million views.”',
        '“Zero cash, but what a brand. They recognize me at bankruptcy court.”',
        '“I put everything into ads. Nothing was left for the product, for me, or for payroll, in that order.”',
      ],
    },
  },
  // The greedy heir: dividends, bonuses, and above all never reinvest.
  delarente: {
    ceoName: 'Sir Reginald Trustfund III',
    companyName: 'Trustfund & Heirs',
    ticker: 'HEIR',
    tagline: 'Working is fine. Having other people work for you is finer.',
    quotes: [
      '“I’ve never worked a day in my life, and look how well I’ve done.”',
      '“A dividend in the hand is worth two in the business plan.”',
      '“Yogurt is my cash cow. Literally and figuratively.”',
      '“My bonus isn’t a reward. It’s a family tradition.”',
      '“Reinvest? What a peculiar idea.”',
      '“Grandfather founded the company, Father ran it, and I cash it. Everyone has a calling.”',
      '“Hard work is good for you. That’s why I leave all of it to my employees.”',
      '“A new factory? Whatever for? The old one still produces dividends.”',
      '“My bonus follows a very sophisticated formula: everything there is, minus one dollar.”',
      '“Pay raises are inflation. My dividends are civilization.”',
      '“I never visit the factories. The smell of labor disagrees with me.”',
      '“Trickle-down works beautifully. Everything trickles right down to me.”',
      '“Reinvest the profits? My ancestors would roll over in their climate-controlled crypt.”',
      '“Minority shareholders have my deepest respect. The dividend, however, stays in the family.”',
      '“My schedule is packed: golf in the morning, the shareholder meeting after lunch, golf at dusk.”',
      '“A recession? I believe I read about it in the society pages.”',
    ],
    landQuotes: {
      won: [
        '“{hex} joins the family estate. The notary has been informed, and so have the heirs.”',
        '“Sold at {price}. The steward handled the envelope; I handled lunch.”',
        '“{company} acquires {hex}. One more acre, one less effort.”',
      ],
      overpaid: [
        '“{price} for {hex}. My grandfather paid for land in bullion; I find this more discreet.”',
        '“Too expensive? Land always goes up. In three centuries I have never been contradicted.”',
        '“{price}, one quarter’s bonus. The next one will repay this one, as always.”',
      ],
      lostToHuman: [
        '“{winner} took {hex}. Hard work pays off in the end, I’m told. I never tried.”',
        '“Lost at {price}. I don’t outbid: I let time do its work, and the banks theirs.”',
        '“{hex} slips away. The family survived revolutions; it will survive an auction.”',
      ],
      lostToBot: [
        '“{winner} pays {price} for {hex}. New money, clearly: they paid the asking price.”',
        '“We lost {hex} to {winner}. Let them farm it; we’ll buy it back from the widow.”',
        '“{bidders} envelopes, mine written with a fountain pen. The others were in more of a hurry.”',
      ],
      fallback: [
        '“The fallback is a lesser estate, but an estate. The title comes with the years.”',
        '“We didn’t get {hex}. The fallback cell has fine exposure and no neighbors: perfect for a rent.”',
        '“Fallback at reserve price: my steward calls that a bargain. I don’t know what that is.”',
      ],
    },
    farewells: {
      won: [
        '“I did nothing all game and I won. As usual.”',
        '“Victory is hereditary. Meet my heir, who did nothing either.”',
        '“My dividends carried me here. I didn’t have to walk.”',
      ],
      podium: [
        '“On the podium, in an armchair. The butler climbed the steps for me.”',
        '“On the podium, behind a worker. The world is changing, alas.”',
        '“An honorable place, acquired without effort. That is the whole art.”',
      ],
      pack: [
        '“An average ranking for a superior estate. Rankings pass, rents remain.”',
        '“I didn’t win, but I collected my bonus every quarter. That’s my way of winning.”',
        '“Hard work didn’t pay. I see no reason to change my mind.”',
      ],
      ruined: [
        '“Ruined, but elegantly: the debt is in the family’s name.”',
        '“The manor is mortgaged, so are the yogurts. We still have the title.”',
        '“Having others work is fine. Apparently one should pay them.”',
      ],
    },
  },
};

/** English NPC companies (keyed by NpcCompanyDef.id), one per sector. */
export const EN_NPCS: Record<string, NpcText> = {
  sucralin: {
    name: 'Sugarloaf Beverage Co.',
    ticker: 'SGR',
    ceoName: 'Candace Glucose',
    description: 'Longtime leader in lukewarm soda, which became an “energy drink” with a simple label change.',
    productName: 'Sugarloaf Turbo',
  },
  bidulix: {
    name: 'Gizmotron Industries',
    ticker: 'GIZ',
    ceoName: 'Gordon Obsolescence',
    description: 'Smart devices engineered to break down the day after the warranty expires.',
    productName: 'GizmoWatch Ultra',
  },
  roulecolo: {
    name: 'Scootopia Mobility',
    ticker: 'SKT',
    ceoName: 'Curtis Sidewalk',
    description: 'Pioneer of dockless scooter sharing and of parking sideways across the sidewalk.',
    productName: 'Scootopia Kamikaze',
  },
  paturin: {
    name: 'Green Pastures Dairy',
    ticker: 'MOO',
    ceoName: 'Marjorie Curdle',
    description: 'Industrial dairy that draws lush meadows on cups made in a strip-mall warehouse.',
    productName: 'Green Pastures Plain, Almost Organic',
  },
  pompelargage: {
    name: 'Pump & Dump Finance',
    ticker: 'PND',
    ceoName: 'Jonah Hodlwell',
    description: 'A “decentralized” exchange whose only server runs in the founder’s garage.',
    productName: 'DumpCoin',
  },
};
