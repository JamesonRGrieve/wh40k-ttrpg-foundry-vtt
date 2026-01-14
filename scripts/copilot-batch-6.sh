#!/bin/bash
# Copilot Batch 6: Combat Talents 151-180

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
151. sparky-squigs_vAgQgdiLGn74xyW6.json
152. spotter_PKgwMat5gaisFrAc.json
153. stalwart-defence_yA7C5HRHRfS4l3H5.json
154. stealth-sniper_LceZ3rLWOIpNHyIx.json
155. step-aside_pW2lW3StcJ5TSqP4.json
156. storm-of-iron_O7pWsdpCCc9mvcyO.json
157. street-fighting_lonqn6q9FoodOfsF.json
158. strength-through-unity_qsn3Tndaao2saDYT.json
159. subversive-programming_je1zyQ7N6fS5Znuv.json
160. suffer-not-the-work-of-heretics_inKikGDEt5QzcTwv.json
161. summary-execution_1VLVIihgrj69p0bo.json
162. superior-chirurgeon_oddwwlbXMV0u0aLB.json
163. superior-supply-chain_D9bgLeNON5OkP40e.json
164. supporting-fire_3ULomIMd8SLOMeMO.json
165. sure-strike_Tjk1W6708lfDyYi6.json
166. surgical-precision_w2iBfV7Ruqp8da38.json
167. swift-attack_z4h0MeJ944bYa3Vl.json
168. take-them-alive_bA4d1NL8NZA6p0eq.json
169. takedown_0Cf8YOeCxd3QjMak.json
170. tank-hunter_qdxtGNW6gyv8p7ko.json
171. target-selection_EmMa2aWbNjNtG5R0.json
172. tear-em-ter-bits_GWb134c31Y3TyCKD.json
173. technical-knock_W6FkTzFZmG8C5ieI.json
174. technological-initiate_0ehbCX4GLUHpckSx.json
175. the-bigger-they-are_t1ZqeKrxHn5XWSQ6.json
176. the-emperor-protects_qAuWbS7hxox0wt8H.json
177. the-reaping_lzJPr3SzxIgTih8U.json
178. through-unity-devastation_SxpcNl77TBGq7jPQ.json
179. thrown-weapon-training-x_4ioMbmjRKgF8077E.json
180. thunder-charge_eeydig1YuGruDGqh.json

TRACKING:
After completing all talents, create a summary report at docs/copilot-batch-6-report.md" --yolo
