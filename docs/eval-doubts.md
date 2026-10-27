# UNRAVIX LENS eval: 'Ask a doubt' prompts (judged qualitatively)

- Endpoint: `https://unravix-lens.pages.dev/api/doubt`  
- Prompts: 6  
- Spend: $0.0698 (from cost_usd)

## doubt-1: why cant i just add 1/2 + 1/3 = 2/5? my teacher says its wrong

- Expected: maths, Class 4-5 (primary). Detected: **maths · Class 4** (primary), subject "Adding fractions with different denominators"
- HTTP 200, 9.0 s, cost $0.0102

**Understood as:** Why is 1/2 + 1/3 = 2/5 wrong and what is the correct answer?  
**Answer:** 1/2 + 1/3 = 5/6, not 2/5.

1. **Tops and bottoms mean different things**: The top number tells how many pieces you have. The bottom number tells how big each piece is. Halves are bigger than fifths, so you cannot just add tops and bottoms.
2. **See it with a treat**: Imagine you have 1/2 of a chocolate bar plus 1/3 of another same bar. Just the 1/2 alone is already bigger than 2/5. So the answer must be bigger than 1/2, and 2/5 cannot be right.
3. **Make the pieces the same size**: To add, we cut both into the same tiny size pieces. 1/2 = 3/6 and 1/3 = 2/6. Now both are counted in sixths.
4. **Now add**: Now add the pieces: 3/6 + 2/6 = 5/6. That is almost a whole bar. So 1/2 + 1/3 = 5/6.

- Key idea: Make the pieces the same size first, then add.
- Misconception: Many students add tops together and bottoms together, but the bottom tells the size of the piece, so adding bottoms changes the size and gives a wrong tiny answer.
- Q1: What is 1/4 + 1/4? → 2/4 = 1/2
- Q2: What is 1/2 + 1/4? → 3/4
- Q3: What is 1/3 + 1/2? Hint: change to sixths first. → 5/6

## doubt-2: Class 9 biology: what is the difference between osmosis and diffusion? I keep mixing them 

- Expected: biology, Class 9 (secondary). Detected: **biology · Class 9** (secondary), subject "Osmosis and diffusion"
- HTTP 200, 9.1 s, cost $0.0103

**Understood as:** What is the difference between osmosis and diffusion?  
**Answer:** Diffusion is movement of any particles from high to low concentration, while osmosis is movement of only water across a semi-permeable membrane from high water to low water concentration.

1. **1. Diffusion in simple words**: Diffusion is the movement of particles like gases, perfume, ink or salts from where they are more to where they are less, until they are evenly spread. No membrane is needed for it. Example: smell of agarbatti spreading in a room, or carbon dioxide moving out of leaf cells.
2. **2. Osmosis in simple words**: Osmosis is the movement of only water across a semi-permeable membrane like the cell membrane. Water moves from the side with more water (dilute solution) to the side with less water (concentrated solution). Example: raisins swelling in water, or water entering root hairs from soil.
3. **3. Main differences to write in exam**: Particles: diffusion is for any substance, osmosis is for water only. Membrane: diffusion does not need a membrane, osmosis must have a semi-permeable membrane. Solution: diffusion works in gases and liquids, osmosis works only in liquids and involves water concentration difference.
4. **4. Trick to never mix them up**: Remember D for Diffusion = Disperse everywhere, and O for Osmosis = Only water through a gate. If the question mentions cell membrane, potato, raisin, root hair and water movement, write osmosis. If it mentions perfume, ink in water, or gases mixing, write diffusion.

- Key idea: Diffusion is for all particles anywhere, osmosis is only water crossing a membrane.
- Misconception: Many students think osmosis is movement of salt or solute, but it is movement of water only; the solute cannot cross the semi-permeable membrane.
- Q1: What substance moves in osmosis? → Only water.
- Q2: Smell of perfume spreading in a room is diffusion or osmosis? → Diffusion, because no membrane is involved.
- Q3: Why does a swollen raisin shrink when kept in concentrated sugar solution? → Water moves out of the raisin by osmosis into the concentrated solution, so it shrinks.

## doubt-3: Depreciation does not take any cash out of the business, so why does it reduce the net pro

- Expected: accounting, Class 11-12 (secondary). Detected: **accounting · Class 11** (secondary), subject "Depreciation and net profit"
- HTTP 200, 6.4 s, cost $0.0072

**Understood as:** Why does depreciation reduce net profit if no cash leaves the business now?  
**Answer:** (concept)

1. **1. Profit is not the same as cash**: Net Profit = Revenues earned during the year minus all costs used up to earn them. It is not Cash Received minus Cash Paid. Depreciation is one such cost, so it is subtracted like salary, rent, etc.
2. **2. Asset cost is used up slowly**: When you buy a machine for Rs 5,00,000 for 5 years, cash goes out on day one, but the machine helps for 5 years. It would be wrong to show the full Rs 5,00,000 cost only in year 1 and zero cost in years 2 to 5.
3. **3. Depreciation spreads that cost**: Accounting follows the matching principle: match each year's revenue with that year's share of cost. So we charge about Rs 1,00,000 per year as depreciation. Entry is: Debit Depreciation A/c, Credit Asset A/c. The debit goes to Profit and Loss A/c and reduces net profit.
4. **4. No cash now, but cost is real**: Cash left the business earlier when the asset was bought. Depreciation does not take out cash now, it just records that part of the asset is now used up. If we ignore it, profit will be overstated and we may think the business earned more than it really did.

- Key idea: Depreciation is spreading the past cash cost of an asset over the years it helps to earn revenue.
- Misconception: Students think Profit = Cash in - Cash out, so non-cash items should not affect profit. This is wrong because profit measures cost used up to earn revenue, not just cash paid this year.
- Q1: Is depreciation a cash payment made during the year? → No. No cash is paid at the time of charging depreciation.
- Q2: Revenue is Rs 1,00,000, cash expenses are Rs 60,000 and depreciation is Rs 10,000. What is net profit? → Rs 30,000. Profit = 1,00,000 - 60,000 - 10,000 = 30,000.
- Q3: What would happen to profit if we did not charge depreciation at all? → Because the cost of using up the asset to earn that revenue would be left out, so profit would look higher than the true profit.

## doubt-4: Why is binary search O(log n)? Where exactly does the log come from?

- Expected: computer_science, Undergrad. Detected: **computer_science · Undergrad** (undergrad), subject "Binary search time complexity"
- HTTP 200, 11.1 s, cost $0.0139

**Understood as:** Why does binary search run in O(log n) time and where does the log come from?  
**Answer:** Because halving n items down to 1 takes log2 n steps, so binary search needs O(log n) comparisons in the worst case.

1. **One comparison halves the problem**: Binary search needs a sorted array. You compare the target to the middle element and discard the half that cannot contain it. So in one comparison the problem size goes from n to n/2.
2. **Repeat the halving**: Keep halving: n to n/2 to n/4 to n/8 to n/16, and so on. After k steps the size left is n / (2^k). Cost is 1 comparison per step, so total cost equals number of steps.
3. **Solve for number of steps**: In the worst case you stop when 1 element is left: n / (2^k) = 1. That gives 2^k = n. Solving for k gives k = log2 n. That is where the log comes from - it is the inverse of repeated doubling.
4. **Drop constants for Big-O**: So worst-case comparisons = log2 n + 1. In Big-O we drop constants and the base, because all log bases differ by a constant factor, so we write O(log n). That is why doubling n adds only 1 extra step.

- Key idea: The log counts how many times you can halve n until you reach 1.
- Misconception: Many think halving once means O(n/2), so repeated halving must be similar - but O(n/2) = O(n), while halving repeatedly until 1 takes only log2 n steps.
- Q1: A sorted array has n = 32. How many worst-case binary search steps? → 5, because log2 32 = 5 (32 -> 16 -> 8 -> 4 -> 2 -> 1).
- Q2: If n doubles from 1024 to 2048, how much extra work does binary search do? → It grows by only 1 extra comparison.
- Q3: If you divide into 3 parts each time instead of 2, what is the complexity? → O(log3 n) which is still O(log n), since log bases differ only by a constant.

## doubt-5: What were the main causes of the Revolt of 1857? (class 8 history)

- Expected: history, Class 8 (middle). Detected: **history · Class 8** (middle), subject "Causes of the Revolt of 1857"
- HTTP 200, 12.4 s, cost $0.0145

**Understood as:** What were the main causes of the Revolt of 1857?  
**Answer:** British annexation of kingdoms, heavy taxes and ruin of artisans, interference in religion and customs, ill-treatment of sepoys, and the greased cartridges together caused the Revolt of 1857.

1. **1. Political causes - kingdoms taken over**: Lord Dalhousie annexed many states using the Doctrine of Lapse, which said an adopted son could not inherit the throne. He also annexed Awadh on the charge of misrule and reduced the respect of Mughal Emperor Bahadur Shah Zafar. Indian rulers felt their power and honour were being taken away.
2. **2. Economic causes - peasants and artisans suffered**: Peasants had to pay very high land revenue and lost their land if they could not pay. Indian weavers and artisans were ruined because cheap machine-made British goods flooded the market. Both groups blamed British economic policies for their poverty.
3. **3. Social and religious causes - fear of losing culture**: Indians feared the British wanted to destroy their religion and culture. Reforms like banning sati, allowing widow remarriage, and spread of Western education and Christian missionaries created suspicion. People believed the British would force everyone to become Christian.
4. **4. Military causes - sepoys were unhappy**: Indian sepoys in the British army got very low pay, few promotions and harsh punishments compared to British soldiers. They were also forced to serve overseas, which hurt their religious feelings. Officers often insulted them, so sepoys felt angry and humiliated.
5. **5. Immediate cause - the greased cartridge spark**: The immediate spark was the new Enfield rifle cartridges rumoured to be greased with cow and pig fat. Sepoys had to bite them open, which offended both Hindus and Muslims. Mangal Pandey revolted at Barrackpore on 29 March 1857, and sepoys at Meerut revolted on 10 May 1857, starting the full Revolt.

- Key idea: The Revolt of 1857 happened because kings, peasants, artisans and sepoys were all angry with unjust British rule.
- Misconception: Many students think the Revolt was only about the greased cartridges, but that was only the final spark; political, economic, social and military anger had been building for years.
- Q1: What was the immediate cause of the Revolt of 1857? → The rumour that new Enfield cartridges were greased with cow and pig fat.
- Q2: What was the Doctrine of Lapse? → A policy by Dalhousie to annex states with no natural heir by not allowing adopted sons to inherit.
- Q3: Give one economic and one military cause of the Revolt. → Economic: high land taxes and ruin of artisans; Military: low pay and disrespect of Indian sepoys.

## doubt-6: I get 20 but the answer says 72. Why? [+ photo doubt-q1.jpg]

- Expected: maths, Class 7-8 (middle). Detected: **maths · Class 7** (middle), subject "Time, Speed and Distance"
- HTTP 200, 7.5 s, cost $0.0137

**Understood as:** Why is the speed 72 km/h and not 20 when a 120 m train passes a pole in 6 seconds?  
**Answer:** 72 km/h

1. **Step 1: Find speed in m/s**: When a train passes a pole, distance covered = length of train = 120 m. Time = 6 s. So Speed = Distance / Time = 120 / 6 = 20 m/s. Your 20 is correct so far!
2. **Step 2: Check the unit asked**: You found 20 m/s, but the question asks for speed in km/h. These are different units, so we cannot stop at 20.
3. **Step 3: Remember the conversion rule**: To convert m/s to km/h, multiply by 18/5. This is because 1 m = 1/1000 km and 1 s = 1/3600 h, so 1 m/s = 3600/1000 km/h = 18/5 km/h.
4. **Step 4: Calculate in km/h**: Speed = 20 x 18/5 = 4 x 18 = 72 km/h. So 20 m/s = 72 km/h, both are the same speed.

- Key idea: 20 m/s and 72 km/h are the same speed, just multiply m/s by 18/5 to get km/h.
- Misconception: Thinking 120/6 = 20 is the final answer; 20 is correct but it is in m/s, and the question asks for km/h, so unit conversion is still needed.
- Q1: A train 100 m long passes a pole in 10 seconds. What is its speed in m/s? → 10 m/s
- Q2: Convert 5 m/s into km/h. → 18 km/h
- Q3: A train 150 m long passes a pole in 10 seconds. What is its speed in km/h? → 54 km/h
