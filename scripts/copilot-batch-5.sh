#!/bin/bash
# Copilot Batch 5: Combat Talents 121-150

copilot -p "You are auditing Rogue Trader VTT talent pack data files. Your task is to audit and fix the following talents according to the standards defined in the documentation.

DOCUMENTATION TO READ FIRST:
1. Read docs/TALENT_TEMPLATE.json
2. Read docs/TALENT_AUDIT_CHECKLIST.md
3. Read docs/TALENT_COMMON_ISSUES.md

CRITICAL RULES:
- Add 'identifier' field (camelCase version of talent name)
- Add complete 'modifiers' and 'grants' objects
- Add 'rollConfig', 'stackable', 'rank', 'specialization', 'notes' fields
- Normalize characteristic keys: bs→ballisticSkill, ws→weaponSkill, s→strength, t→toughness, ag→agility, int→intelligence, per→perception, wp→willpower, fel→fellowship
- Situational modifiers MUST have: key, value, condition, icon

TALENTS TO AUDIT (files in src/packs/rt-items-talents/_source/):
121. plasma-weapon-mastery_dO0QKCcWVMqvRsYV.json
122. precise-blow_PNKDVvEf4q0wkFjC.json
123. precision-killer_5RgaGGL5A6gUxQdQ.json
124. priority-fire_Pv7YvQmV6YVLq8Fr.json
125. prosanguine_knijLuqZsh3xlqnb.json
126. psychic-null-x_34Dd1EIwMGKsIPPw.json
127. pugilist_IsjQ9NiuGu1o3XKk.json
128. pure-faith_FKYw2XzF4dyiNDYw.json
129. purge-the-unclean_9FvLxXoSNb8IsaCw.json
130. purity-of-hatred-x_VQ4mwbR0RWYNz0g4.json
131. quick-draw_qdn5GQvS11uRvnIO.json
132. rabbit-punch_qw31IcLoNcy8M7hS.json
133. rage-of-the-zealot_Sk4GhDuRtpzFFcbj.json
134. ranged-weapon-expert_5ggFY8BWbZIYLIJf.json
135. rapid-reload_iG1MY7xeXJLaZYrr.json
136. raptor_zgGtbt3Puri6M937.json
137. righteous-blow_SHukboEfXOfQorvc.json
138. ripper-charge_G99F16aLX1EKT2ue.json
139. rite-of-static-overload_jlAvSK6UlbpqZGu3.json
140. rite-of-synchronised-steel_n26przk0ScS4Fize.json
141. sacred-flame_tyPNVRATxLXUc8pZ.json
142. sacrifice_lu42AwNoorZy9kas.json
143. scourge-of-heretics_vz6hUuxGPRxuzg6x.json
144. secrets-of-the-seers_2N63ES3YU9PGyRYo.json
145. sharpshooter_62lgUAj4MmCO9zfz.json
146. shielding-faith_INNyPiGHbf6C17GO.json
147. sidearm_pONHr7kr6XDyhTOx.json
148. slayer-of-daemons_1BRfuLkSDpqyktrf.json
149. solid-projectile-weapon-expertise_L6VuVjA7xliUz9Pp.json
150. solid-projectile-weapon-mastery_toQxF0dPCNNX88HF.json

TRACKING:
After completing all talents, create a summary report at docs/copilot-batch-5-report.md" --yolo
