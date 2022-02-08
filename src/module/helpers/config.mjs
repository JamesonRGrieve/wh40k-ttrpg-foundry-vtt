export const DarkHeresy = {};

DarkHeresy.bio = {
  'homeWorld': ["Adeptus Astartes Homeworld", "Agri-World", "Cardinal World", "Cemetary World", "Civilized World", "Craftworld", "Crone World", "Daemon World", "Death World", "Desert World", "Exodite World", "Feral World", "Feudal World", "Forge World", "Frontier World", "Garden World", "Gas Giant", "Highborn", "Hive World", "Knight World", "Ice World", "Industrial World", "Jungle World", "Maiden World", "Mining World", "Navis Nobilite World", "Ocean World", "Ork World", "Penal Colony", "Pleasure World", "Quarantine World", "Research Station", "Shrine World", "Tau World", "Tomb World", "Voidborn", "Xenos World"],
  'background': ["Adepta Sororitas", "Adeptus Administratum", "Adeptus Arbites", "Adeptus Astra Telepathica", "Adeptus Mechanicus", "Adeptus Ministorum", "Exorcised", "Heretek", "Imperial Guard", "Imperial Navy", "Mutant", "Outcast", "Rogue Trader Fleet"],
  'role': ["Ace", "Assassin", "Chirurgeon", "Crusader", "Desperado", "Fanatic", "Hierophant", "Mystic", "Penitent", "Sage", "Seeker", "Warrior"],
  'divination': ["Mutation without, corruption within.", "Trust in your fear.", "Humans must die so that humanity can endure.", "The pain of the bullet is ecstasy compared to damnation.", "Be a boon to your allies and the bane of your enemies.", "The wise learn from the deaths of others.", "Kill the alien before it can speak its lies.", "Truth is subjective.", "Thought begets Heresy.", "Heresy begets Retribution.", "A mind without purpose wanders in dark places.", "If a job is worth doing, it is worth dying for.", "Dark dreams lie upon the heart.", "Violence solves everything.", "Ignorance is a wisdom of its own.", "Only the insane have strength enough to prosper.", "A suspicious mind is a healthy mind.", "Suffering is an unrelenting instructor", "The only true fear is dying without your duty done.", "Only in death does duty end.", "Innocence is an illusion.", "To war is human.", "There is no substitute for zeal.", "Even one who has nothing can still offer his life.", "Do not ask why you serve. Only ask how."]
}

DarkHeresy.ui = {
  toggleExpanded: function(name) {
    if(DarkHeresy.ui.expanded.includes(name)) {
      const index = DarkHeresy.ui.expanded.indexOf(name);
      if (index > -1) {
        DarkHeresy.ui.expanded.splice(index, 1);
      }
    } else {
      DarkHeresy.ui.expanded.push(name);
    }
  },
  'expanded': []
}
