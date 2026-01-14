#!/bin/bash
# Copilot Batch 9: Combat Talents - Final Round 3/3 (52 talents)

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
103. rite-of-static-overload_jlAvSK6UlbpqZGu3.json
104. sacrifice_lu42AwNoorZy9kas.json
105. scourge-of-heretics_vz6hUuxGPRxuzg6x.json
106. sharpshooter_62lgUAj4MmCO9zfz.json
107. shielding-faith_INNyPiGHbf6C17GO.json
108. sidearm_pONHr7kr6XDyhTOx.json
109. slayer-of-daemons_1BRfuLkSDpqyktrf.json
110. sparky-squigs_vAgQgdiLGn74xyW6.json
111. stealth-sniper_LceZ3rLWOIpNHyIx.json
112. step-aside_pW2lW3StcJ5TSqP4.json
113. storm-of-iron_O7pWsdpCCc9mvcyO.json
114. street-fighting_lonqn6q9FoodOfsF.json
115. strength-through-unity_qsn3Tndaao2saDYT.json
116. sure-strike_Tjk1W6708lfDyYi6.json
117. surgical-precision_w2iBfV7Ruqp8da38.json
118. takedown_0Cf8YOeCxd3QjMak.json
119. tank-hunter_qdxtGNW6gyv8p7ko.json
120. tormenter-s-fury_3yisrPKpPyLjJ19m.json
121. tormenter-s-supremacy_mV2zLpcLwHoHxYum.json
122. true-grit_6OzNPNirtqOk3woy.json
123. two-against-the-odds_5tFT5QCgFU4IUvjQ.json
124. two-weapon-master_dpipY69T0sw3UppP.json
125. two-weapon-wielder-x_FBpi0y0EIrPliHme.json
126. ultimate-sanction_Lew5r6IazrsDrePT.json
127. unarmed-master_IF62w3QEqhQwG75Z.json
128. unarmed-specialist_UUYbaIcgfJpY3I3K.json
129. unarmed-warrior_uYKZjT1vQuhZ7jcm.json
130. unbowed-and-unbroken_V25CWHZ3cJfHtmVu.json
131. underfoot-assault_lwvqfM5GMcey3g0c.json
132. unhallowed-discovery_gXdmq6hLWfbhhaD9.json
133. unholy-devotion_fof9iuOkT2VPInED.json
134. unremarkable_J7ThXpRuaRPOo0sj.json
135. unstoppable-charge_KcPqc3t8VGv2yjO2.json
136. vengeful-protector_7cwuQuyqfRZOGjHV.json
137. versatile-shooter_HusNsomBFkJCvFuo.json
138. veteran-comrade_KCNvd1kiD6ve90WM.json
139. vitality-coils_kSRpOiyow5LeTLdQ.json
140. void-tactician_6j0WovgeXFmQQ4F3.json
141. waaagh_x5JKUdJmMVtfOMpQ.json
142. wall-of-steel_0FrabNbwBK7mPhck.json
143. warp-banisher_UoTLUAhlmB449NfL.json
144. warp-lock_96GpPmL9ZoS5JqwF.json
145. watchful-for-betrayal_fYoYPcMWEOsHRv9U.json
146. weapon-intuition_9t4WFHjUZIVXyfkS.json
147. weapon-tech_liHLz2cdLrMIXQN7.json
148. weapon-training-x_INDCmo3gHBgiF8D8.json
149. whirlwind-of-death_PpSGPexwhUgmMDTm.json
150. wild-charge_2Bfi6EEbH8djDLA9.json
151. worky-gubbinz_tkWh5HrMNfE0ur7J.json
152. wrath-of-the-righteous_N4PfmL2lczN87cT9.json
153. wrestler_7OuMiM1wzh4ZPotS.json
154. xenos-weapon-proficiency-ork_uiB9pcAUje2WrbpC.json

TRACKING:
After completing all talents, create a summary report at docs/copilot-batch-9-report.md" --yolo
