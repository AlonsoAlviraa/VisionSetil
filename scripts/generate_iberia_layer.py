#!/usr/bin/env python3
"""Generate curated Iberian expansion layer for species_catalog_v2.

Writes data/species_catalog/layers/iberia_common.json with species not
necessarily present in the FE TypeScript seed. Safe defaults:
  - edibility_code desconocido unless listed
  - risk_level mapped conservatively
  - vernáculos ES required; CA/EU/EN when known
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "species_catalog" / "layers" / "iberia_common.json"
EXISTING = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"

# scientific, es_names, family, categories, edibility, risk, habitat, season, ca, eu, en, tagline_es
# edibility: excelente|buen_comestible|comestible_con_cautela|no_recomendado|toxico|mortifero|desconocido
RAW: list[tuple] = [
    # --- Amanitas ibéricas / europeas ---
    ("Amanita ponderosa", ["Gurumelo"], "Amanitaceae", ["amanitas"], "buen_comestible", "risky_lookalikes", "Dehesas y jarales del suroeste ibérico", "Primavera", ["Gurumelo"], ["Gurumeloa"], ["Ponderous amanita"], "Seta emblemática del suroeste ibérico"),
    ("Amanita ovoidea", ["Oronja blanca", "Amanita ovoidea"], "Amanitaceae", ["amanitas"], "comestible_con_cautela", "risky_lookalikes", "Encinares y pinares mediterráneos", "Otoño–invierno", ["Oronja blanca"], [], ["Bearded amanita"], "Gran amanita blanca mediterránea"),
    ("Amanita proxima", ["Amanita próxima"], "Amanitaceae", ["amanitas", "toxicas"], "mortifero", "deadly", "Mediterráneo, con frondosas", "Otoño", ["Amanita pròxima"], [], ["Amanita proxima"], "Mortal; confusión con gurumelo y oronjas"),
    ("Amanita gemmata", ["Amanita gemada", "Oronja gemada"], "Amanitaceae", ["amanitas", "toxicas"], "toxico", "high", "Pinares y mixtos", "Primavera–otoño", ["Reig gemat"], [], ["Jewelled amanita"], "Tóxica; confusión con comestibles"),
    ("Amanita crocea", ["Amanita anaranjada"], "Amanitaceae", ["amanitas"], "comestible_con_cautela", "risky_lookalikes", "Abedules y frondosas", "Verano–otoño", [], [], ["Orange griset"], "Amanita anillada anaranjada"),
    ("Amanita vaginata", ["Amanita vaginada", "Oronja gris"], "Amanitaceae", ["amanitas"], "comestible_con_cautela", "risky_lookalikes", "Bosques mixtos", "Verano–otoño", ["Reig vulgat"], [], ["Grisette"], "Sin anillo; volva en saco"),
    ("Amanita battarrae", ["Amanita de Battarra"], "Amanitaceae", ["amanitas"], "desconocido", "medium", "Bosques mediterráneos", "Otoño", [], [], ["Battarra's amanita"], "Amanita gris mediterránea"),
    ("Amanita strobiliformis", ["Amanita piñonera"], "Amanitaceae", ["amanitas"], "comestible_con_cautela", "risky_lookalikes", "Parques y frondosas", "Verano–otoño", [], [], ["Warted amanita"], "Sombrero con escamas angulosas"),
    ("Amanita echinocephala", ["Amanita erizada"], "Amanitaceae", ["amanitas"], "no_recomendado", "medium", "Calizas mediterráneas", "Verano–otoño", [], [], ["Solitary amanita"], "Escamas puntiagudas en el sombrero"),
    ("Amanita franchetii", ["Amanita de Franchet"], "Amanitaceae", ["amanitas"], "no_recomendado", "medium", "Bosques mixtos", "Verano–otoño", [], [], ["Franchet's amanita"], "Amanita amarillenta con velo"),
    ("Amanita mairei", ["Amanita de Maire"], "Amanitaceae", ["amanitas"], "desconocido", "medium", "Pinares mediterráneos", "Otoño", [], [], ["Maire's amanita"], "Amanita mediterránea de pinares"),
    ("Amanita eliae", ["Amanita de Elías"], "Amanitaceae", ["amanitas"], "desconocido", "medium", "Frondosas", "Verano", [], [], ["Amanita eliae"], "Amanita poco frecuente"),
    # --- Agaricus / Lepiota / Chlorophyllum ---
    ("Agaricus bitorquis", ["Champiñón de dos anillos"], "Agaricaceae", ["agaricus"], "buen_comestible", "risky_lookalikes", "Bordes de caminos, suelos compactos", "Primavera–otoño", ["Xampinyó de dos anells"], [], ["Pavement mushroom"], "Champiñón urbano resistente"),
    ("Agaricus sylvaticus", ["Champiñón de bosque"], "Agaricaceae", ["agaricus"], "buen_comestible", "risky_lookalikes", "Coníferas", "Verano–otoño", ["Xampinyó de bosc"], [], ["Blushing wood mushroom"], "Enrojece al corte"),
    ("Agaricus augustus", ["Champiñón del emperador", "Bola de nieve"], "Agaricaceae", ["agaricus"], "excelente", "risky_lookalikes", "Parques y bosques", "Verano–otoño", ["Xampinyó imperial"], [], ["The prince"], "Aroma a almendras"),
    ("Agaricus urinascens", ["Champiñón de pradera grande"], "Agaricaceae", ["agaricus"], "buen_comestible", "risky_lookalikes", "Praderas", "Verano–otoño", [], [], ["Macro mushroom"], "Gran agaricus de prado"),
    ("Agaricus langei", ["Champiñón de Lange"], "Agaricaceae", ["agaricus"], "buen_comestible", "risky_lookalikes", "Coníferas", "Otoño", [], [], ["Scaly wood mushroom"], "Escamoso de pinares"),
    ("Leucoagaricus leucothites", ["Agarico blanco", "Seda blanca"], "Agaricaceae", ["agaricus"], "comestible_con_cautela", "risky_lookalikes", "Prados y jardines", "Otoño", [], [], ["White dapperling"], "Confusión con amanitas blancas"),
    ("Lepiota cristata", ["Lepiota crestada"], "Agaricaceae", ["toxicas"], "toxico", "high", "Jardines y bordes", "Verano–otoño", ["Lepiota crestada"], [], ["Stinking dapperling"], "Tóxica; olor desagradable"),
    ("Lepiota clypeolaria", ["Lepiota con escudo"], "Agaricaceae", ["toxicas"], "toxico", "high", "Bosques mixtos", "Otoño", [], [], ["Shield dapperling"], "Lepiota tóxica boscosa"),
    ("Chlorophyllum brunneum", ["Apagador moreno"], "Agaricaceae", ["toxicas", "macrolepiotas"], "toxico", "high", "Jardines y compost", "Otoño", [], [], ["Shaggy parasol (brown)"], "Tóxica; confusión con apagador"),
    ("Chlorophyllum molybdites", ["Parasol verde", "Lepiota de esporas verdes"], "Agaricaceae", ["toxicas"], "toxico", "high", "Céspedes (más tropical/introducida)", "Verano", [], [], ["Green-spored parasol"], "Esporada verdosa; tóxica"),
    # --- Boletales ---
    ("Butyriboletus regius", ["Boleto real", "Boleto regius"], "Boletaceae", ["boletus"], "excelente", "risky_lookalikes", "Castaños y robles", "Verano–otoño", ["Cep reial"], [], ["Butter bolete"], "Poros amarillos; excelente interés culinario"),
    ("Butyriboletus appendiculatus", ["Boleto apendiculado"], "Boletaceae", ["boletus"], "buen_comestible", "risky_lookalikes", "Robledales", "Verano–otoño", [], [], ["Appendiculate bolete"], "Pie reticulado amarillo"),
    ("Suillus bellinii", ["Boleto de Bellini", "Mizclo de pino mediterráneo"], "Suillaceae", ["boletus"], "buen_comestible", "low", "Pinares mediterráneos (P. pinea, P. halepensis)", "Otoño–invierno", ["Moixernó de pi"], [], ["Bellini's bolete"], "Muy común en pinares costeros"),
    ("Suillus collinitus", ["Boleto collinitus"], "Suillaceae", ["boletus"], "buen_comestible", "low", "Pinares mediterráneos", "Otoño", [], [], ["Ringless bolete"], "Micorriza de pinos"),
    ("Suillus mediterraneensis", ["Boleto mediterráneo"], "Suillaceae", ["boletus"], "buen_comestible", "low", "Pinares mediterráneos", "Otoño–invierno", [], [], ["Mediterranean bolete"], "Típico de la costa mediterránea"),
    ("Xerocomus subtomentosus", ["Boleto aterciopelado"], "Boletaceae", ["boletus"], "buen_comestible", "low", "Bosques mixtos", "Verano–otoño", [], [], ["Suede bolete"], "Cutícula aterciopelada"),
    ("Hortiboletus rubellus", ["Boleto rojo de jardín"], "Boletaceae", ["boletus"], "buen_comestible", "low", "Parques y jardines", "Verano–otoño", [], [], ["Ruby bolete"], "Sombrero rojo vivo"),
    ("Cyanoboletus pulverulentus", ["Boleto pulverulento"], "Boletaceae", ["boletus"], "buen_comestible", "low", "Frondosas", "Verano–otoño", [], [], ["Ink stain bolete"], "Azulea intensamente al corte"),
    ("Gyroporus cyanescens", ["Boleto azulante"], "Gyroporaceae", ["boletus"], "buen_comestible", "low", "Silíceos, abedules y castaños", "Verano–otoño", [], [], ["Cornflower bolete"], "Azul intenso al roce"),
    ("Leccinellum lepidum", ["Hongo de encina", "Leccinum de encina"], "Boletaceae", ["boletus"], "buen_comestible", "low", "Encinares y alcornocales", "Otoño–invierno", ["Surfí d'alzina"], [], ["Holm-oak bolete"], "Muy ibérico/mediterráneo"),
    ("Leccinellum crocipodium", ["Leccinum azafranado"], "Boletaceae", ["boletus"], "buen_comestible", "low", "Robles y castaños", "Verano–otoño", [], [], ["Saffron-footed bolete"], "Pie y poros amarillo azafrán"),
    ("Chroogomphus rutilus", ["Pinocho", "Gomphidius cobrizo"], "Gomphidiaceae", ["otras"], "buen_comestible", "low", "Pinares", "Otoño", ["Pinos"], [], ["Copper spike"], "Asociado a pinos"),
    ("Gomphidius glutinosus", ["Gomphidio viscoso"], "Gomphidiaceae", ["otras"], "buen_comestible", "low", "Piceas y coníferas", "Otoño", [], [], ["Slimy spike-cap"], "Sombrero viscoso"),
    ("Rhizopogon roseolus", ["Patata de tierra", "Trufa falsa rosa"], "Rhizopogonaceae", ["otras"], "comestible_con_cautela", "medium", "Pinares arenosos", "Todo el año (hipogeo)", [], [], ["Rose-coloured false truffle"], "Hipogea en pinares"),
    ("Pisolithus arhizus", ["Pedo de lobo de tinta", "Boleto de dyers"], "Sclerodermataceae", ["otras"], "no_recomendado", "medium", "Suelos pobres, pinares", "Verano–otoño", [], [], ["Dyeball"], "Usada en tintes; no culinaria"),
    # --- Lactarius / Russula ---
    ("Lactarius semisanguifluus", ["Nízcalo de sangre poco intensa"], "Russulaceae", ["lactarius"], "buen_comestible", "low", "Pinares mediterráneos", "Otoño", ["Rovelló"], [], ["Semi-saffron milkcap"], "Látex anaranjado que vira poco"),
    ("Lactarius quieticolor", ["Nízcalo de color apagado"], "Russulaceae", ["lactarius"], "buen_comestible", "low", "Pinares", "Otoño", [], [], ["Dull milkcap"], "De pinares atlánticos"),
    ("Lactarius vellereus", ["Lactario aterciopelado"], "Russulaceae", ["lactarius"], "no_recomendado", "medium", "Frondosas", "Otoño", [], [], ["Fleecy milkcap"], "Muy acre"),
    ("Lactarius piperatus", ["Lactario pimentero"], "Russulaceae", ["lactarius"], "no_recomendado", "medium", "Frondosas", "Verano–otoño", [], [], ["Peppery milkcap"], "Látex blanco muy picante"),
    ("Lactarius volemus", ["Lactario anaranjado oloroso"], "Russulaceae", ["lactarius"], "buen_comestible", "low", "Frondosas", "Verano–otoño", [], [], ["Fishy milkcap"], "Olor a pescado; látex abundante"),
    ("Lactarius quietus", ["Lactario del roble"], "Russulaceae", ["lactarius"], "no_recomendado", "medium", "Robledales", "Otoño", [], [], ["Oakbug milkcap"], "Olor a chinche"),
    ("Russula aurea", ["Rúsula dorada"], "Russulaceae", ["russulas"], "buen_comestible", "low", "Frondosas", "Verano–otoño", [], [], ["Golden brittlegill"], "Sombrero rojo-dorado"),
    ("Russula ochroleuca", ["Rúsula ocrácea"], "Russulaceae", ["russulas"], "no_recomendado", "medium", "Coníferas y mixtos", "Otoño", [], [], ["Ochre brittlegill"], "Sabor acre"),
    ("Russula sardonia", ["Rúsula sardonica"], "Russulaceae", ["russulas", "toxicas"], "toxico", "high", "Pinares", "Otoño", [], [], ["Primrose brittlegill"], "Acre y purgante"),
    ("Russula delica", ["Rúsula blanca de leche"], "Russulaceae", ["russulas"], "comestible_con_cautela", "medium", "Bosques mixtos", "Verano–otoño", [], [], ["Milk-white brittlegill"], "Parecida a lactarios blancos"),
    ("Russula integra", ["Rúsula íntegra"], "Russulaceae", ["russulas"], "buen_comestible", "low", "Coníferas de montaña", "Verano–otoño", [], [], ["Entire brittlegill"], "Buena rúsula de montaña"),
    ("Russula mustelina", ["Rúsula mustelina"], "Russulaceae", ["russulas"], "buen_comestible", "low", "Abetales", "Verano–otoño", [], [], ["Weasel brittlegill"], "Sombrero pardo-mostaza"),
    ("Russula torulosa", ["Rúsula torulosa"], "Russulaceae", ["russulas"], "no_recomendado", "medium", "Pinares mediterráneos", "Otoño", [], [], ["Russula torulosa"], "Mediterránea de pinares"),
    ("Russula amethystina", ["Rúsula amatista"], "Russulaceae", ["russulas"], "buen_comestible", "low", "Coníferas", "Otoño", [], [], ["Amethyst brittlegill"], "Sombrero violeta"),
    # --- Tricholoma / Lepista / Clitocybe ---
    ("Tricholoma saponaceum", ["Tricoloma jabonoso"], "Tricholomataceae", ["tricholomas"], "no_recomendado", "medium", "Bosques mixtos", "Otoño", [], [], ["Soapy knight"], "Olor a jabón"),
    ("Tricholoma sejunctum", ["Tricoloma separado"], "Tricholomataceae", ["tricholomas"], "no_recomendado", "medium", "Frondosas", "Otoño", [], [], ["Separating knight"], "Sombrero oliva fibriloso"),
    ("Tricholoma columbetta", ["Tricoloma paloma"], "Tricholomataceae", ["tricholomas"], "buen_comestible", "low", "Frondosas silíceas", "Otoño", [], [], ["Blue spot knight"], "Blanca con tintes azulados"),
    ("Tricholoma sulphureum", ["Tricoloma azufrado"], "Tricholomataceae", ["tricholomas", "toxicas"], "toxico", "high", "Bosques mixtos", "Otoño", [], [], ["Sulphur knight"], "Olor a gas; tóxica"),
    ("Tricholoma populinum", ["Tricoloma del chopo"], "Tricholomataceae", ["tricholomas"], "buen_comestible", "low", "Choperas", "Otoño", [], [], ["Poplar knight"], "Asociada a chopos"),
    ("Tricholoma caligatum", ["Tricoloma caligado"], "Tricholomataceae", ["tricholomas"], "comestible_con_cautela", "medium", "Pinares mediterráneos", "Otoño", [], [], ["Booted knight"], "Mediterránea; sabor variable"),
    ("Tricholoma focale", ["Tricoloma focal"], "Tricholomataceae", ["tricholomas"], "no_recomendado", "medium", "Pinares", "Otoño", [], [], ["Booted knight"], "Anillo y pie booted"),
    ("Lepista nuda", ["Pie azul", "Níscalo morado"], "Tricholomataceae", ["otras"], "buen_comestible", "low", "Bosques y compost", "Otoño–invierno", ["Peu blau", "Blaveta"], ["Oin urdin"], ["Wood blewit"], "Láminas lilas características"),
    ("Lepista saeva", ["Pie violeta de prado"], "Tricholomataceae", ["otras"], "buen_comestible", "low", "Praderas", "Otoño–invierno", [], [], ["Field blewit"], "Pie lila, sombrero pardo"),
    ("Lepista personata", ["Lepista enmascarada"], "Tricholomataceae", ["otras"], "buen_comestible", "low", "Prados", "Otoño–invierno", [], [], ["Field blewit"], "Sinónimo cercano a saeva"),
    ("Lepista sordida", ["Lepista sórdida"], "Tricholomataceae", ["otras"], "buen_comestible", "low", "Jardines y nitrófilos", "Todo el año", [], [], ["Sordid blewit"], "Más delgada que nuda"),
    ("Clitocybe nebularis", ["Pardilla", "Clitocibe nebuloso"], "Tricholomataceae", ["otras"], "comestible_con_cautela", "risky_lookalikes", "Bosques mixtos", "Otoño–invierno", ["Griseta"], [], ["Clouded funnel"], "Controversia digestiva"),
    ("Clitocybe odora", ["Clitocibe anisado"], "Tricholomataceae", ["otras"], "buen_comestible", "low", "Frondosas", "Verano–otoño", [], [], ["Aniseed funnel"], "Fuerte olor a anís"),
    ("Clitocybe rivulosa", ["Clitocibe de los caminos"], "Tricholomataceae", ["toxicas"], "mortifero", "deadly", "Praderas y caminos", "Otoño", [], [], ["Fool's funnel"], "Mortal; confusión con marasmius"),
    ("Infundibulicybe geotropa", ["Platera", "Clitocibe geotropo"], "Tricholomataceae", ["otras"], "buen_comestible", "low", "Bosques abiertos", "Otoño–invierno", ["Platera"], [], ["Trooping funnel"], "Grandes corros"),
    ("Infundibulicybe gibba", ["Clitocibe embudado"], "Tricholomataceae", ["otras"], "buen_comestible", "low", "Bosques", "Verano–otoño", [], [], ["Common funnel"], "Forma de embudo"),
    ("Lyophyllum decastes", ["Seta de roca", "Lyophyllum en ramos"], "Lyophyllaceae", ["otras"], "buen_comestible", "low", "Bordes de caminos, gravas", "Otoño", [], [], ["Fried chicken mushroom"], "Crece en matas densas"),
    # --- Cantharellales / Hydnums ---
    ("Cantharellus amethysteus", ["Rebozuelo amatista"], "Cantharellaceae", ["cantharellus"], "excelente", "low", "Frondosas", "Verano–otoño", ["Rossinyol"], [], ["Amethyst chanterelle"], "Escamas lilas en el sombrero"),
    ("Cantharellus cinereus", ["Rebozuelo ceniciento"], "Cantharellaceae", ["cantharellus"], "buen_comestible", "low", "Frondosas", "Verano–otoño", [], [], ["Ashen chanterelle"], "Grisáceo, pliegues claros"),
    ("Pseudocraterellus undulatus", ["Trompetilla ondulada"], "Cantharellaceae", ["cantharellus"], "buen_comestible", "low", "Frondosas", "Verano–otoño", [], [], ["Sinuous chanterelle"], "Similar a trompetas"),
    ("Gomphus clavatus", ["Pata de perdiz", "Gomphus"], "Gomphaceae", ["otras"], "buen_comestible", "low", "Coníferas de montaña", "Verano–otoño", [], [], ["Pig's ear"], "Forma de abanico violeta"),
    ("Hydnum albidum", ["Lengua de gato blanca"], "Hydnaceae", ["otras"], "buen_comestible", "low", "Bosques calcáreos", "Otoño", [], [], ["White hedgehog"], "Aguijones blancos"),
    # --- Cortinariaceae / Inocybe (safety) ---
    ("Cortinarius praestans", ["Cortinario excelente"], "Cortinariaceae", ["otras"], "buen_comestible", "risky_lookalikes", "Frondosas calcáreas", "Otoño", [], [], ["Goliath webcap"], "Gran cortinario; precaución de género"),
    ("Cortinarius caperatus", ["Pergamino", "Cortinario arrugado"], "Cortinariaceae", ["otras"], "buen_comestible", "risky_lookalikes", "Coníferas y abedules", "Otoño", [], [], ["The gypsy"], "Anillo membranoso"),
    ("Cortinarius violaceus", ["Cortinario violeta"], "Cortinariaceae", ["otras"], "no_recomendado", "medium", "Frondosas", "Otoño", [], [], ["Violet webcap"], "Violeta intenso"),
    ("Cortinarius semisanguineus", ["Cortinario semisanguíneo"], "Cortinariaceae", ["toxicas"], "toxico", "high", "Coníferas", "Otoño", [], [], ["Surprise webcap"], "Láminas rojo sangre"),
    ("Cortinarius collinitus", ["Cortinario viscoso"], "Cortinariaceae", ["otras"], "no_recomendado", "medium", "Coníferas", "Otoño", [], [], ["Blue-girdled webcap"], "Muy viscoso"),
    ("Inocybe erubescens", ["Inocybe rojiza", "Inocybe de Patouillard"], "Inocybaceae", ["toxicas"], "mortifero", "deadly", "Parques y frondosas", "Primavera–verano", [], [], ["Deadly fibrecap"], "Mortal por muscarina"),
    ("Inocybe geophylla", ["Inocybe de láminas color tierra"], "Inocybaceae", ["toxicas"], "toxico", "high", "Bosques y jardines", "Verano–otoño", [], [], ["White fibrecap"], "Tóxica muscarínica"),
    ("Conocybe filaris", ["Conocybe filaris"], "Bolbitiaceae", ["toxicas"], "mortifero", "deadly", "Céspedes y compost", "Verano–otoño", [], [], ["Deadly conocybe"], "Amatoxinas; mortal"),
    # --- Hygrophorus / Hygrocybe ---
    ("Hygrophorus marzuolus", ["Marzuelo", "Seta de marzo"], "Hygrophoraceae", ["otras"], "excelente", "low", "Pinares y abetales de montaña", "Invierno–primavera", ["Marçot"], ["Martxoko ziza"], ["March mushroom"], "Una de las primeras de la temporada"),
    ("Hygrophorus russula", ["Higróforo rúsula"], "Hygrophoraceae", ["otras"], "buen_comestible", "low", "Robledales", "Otoño", [], [], ["Pinkmottle woodwax"], "Sombrero rosado manchado"),
    ("Hygrophorus chrysodon", ["Higróforo de dientes dorados"], "Hygrophoraceae", ["otras"], "buen_comestible", "low", "Frondosas calcáreas", "Otoño", [], [], ["Gold flecked woodwax"], "Puntos amarillos en el margen"),
    ("Hygrophorus latitabundus", ["Llenega negra", "Higróforo limoso"], "Hygrophoraceae", ["otras"], "buen_comestible", "low", "Pinares mediterráneos", "Otoño–invierno", ["Llenega negra"], [], ["Ebony woodwax"], "Muy apreciada en Cataluña"),
    ("Hygrophorus agathosmus", ["Higróforo de buen olor"], "Hygrophoraceae", ["otras"], "buen_comestible", "low", "Coníferas", "Otoño", [], [], ["Almond woodwax"], "Olor a almendras amargas"),
    ("Hygrocybe conica", ["Higrócibe cónica"], "Hygrophoraceae", ["otras"], "no_recomendado", "medium", "Prados", "Verano–otoño", [], [], ["Witch's hat"], "Ennegrece al roce"),
    ("Hygrocybe punicea", ["Higrócibe escarlata"], "Hygrophoraceae", ["otras"], "no_recomendado", "medium", "Prados pobres", "Otoño", [], [], ["Crimson waxcap"], "Rojo carmín de pradera"),
    ("Hygrocybe psittacina", ["Higrócibe loro"], "Hygrophoraceae", ["otras"], "no_recomendado", "medium", "Prados", "Verano–otoño", [], [], ["Parrot waxcap"], "Verde y amarillo"),
    # --- Morchellaceae / pezizas ---
    ("Morchella vulgaris", ["Colmenilla vulgar"], "Morchellaceae", ["morchellas"], "excelente", "risky_lookalikes", "Frondosas y riberas", "Primavera", ["Múrgola"], [], ["Common morel"], "Consumo solo bien cocinada"),
    ("Morchella deliciosa", ["Colmenilla deliciosa"], "Morchellaceae", ["morchellas"], "excelente", "risky_lookalikes", "Diversos hábitats primaverales", "Primavera", [], [], ["Delicious morel"], "Colmenilla de primavera"),
    ("Gyromitra infula", ["Boletera de mitra"], "Discinaceae", ["toxicas"], "toxico", "high", "Coníferas", "Verano–otoño", [], [], ["Hooded false morel"], "Tóxica; no consumir"),
    ("Sarcosphaera coronaria", ["Corona violeta"], "Pezizaceae", ["toxicas"], "toxico", "high", "Coníferas calcáreas", "Primavera", [], [], ["Violet crown cup"], "Puede acumular arsénico"),
    ("Peziza badia", ["Peziza parda"], "Pezizaceae", ["otras"], "no_recomendado", "medium", "Suelos removidos", "Verano–otoño", [], [], ["Bay cup"], "Copa parda"),
    ("Otidea onotica", ["Oreja de asno"], "Pyronemataceae", ["otras"], "no_recomendado", "medium", "Bosques mixtos", "Otoño", [], [], ["Hare's ear"], "Forma de oreja"),
    ("Helvella acetabulum", ["Helvela copa"], "Helvellaceae", ["otras"], "no_recomendado", "medium", "Frondosas", "Primavera", [], [], ["Vinegar cup"], "Copa costillada"),
    # --- Truffles & desert truffles Iberia ---
    ("Tuber borchii", ["Trufa blanquilla", "Trufa de Borch"], "Tuberaceae", ["trufas"], "excelente", "low", "Pinares y robledales", "Invierno–primavera", [], [], ["Bianchetto truffle"], "Trufa blanca menor"),
    ("Tuber brumale", ["Trufa de invierno"], "Tuberaceae", ["trufas"], "buen_comestible", "low", "Encinares y avellanos", "Invierno", [], [], ["Winter truffle"], "Negra de invierno"),
    ("Tuber mesentericum", ["Trufa mesentérica"], "Tuberaceae", ["trufas"], "buen_comestible", "low", "Frondosas calcáreas", "Otoño–invierno", [], [], ["Bagnoli truffle"], "Olor intenso"),
    ("Tuber rufum", ["Trufa rojiza"], "Tuberaceae", ["trufas"], "comestible_con_cautela", "medium", "Bosques mixtos", "Verano–otoño", [], [], ["Red truffle"], "Pequeña y rojiza"),
    ("Terfezia arenaria", ["Criadilla de tierra", "Turma"], "Terfeziaceae", ["trufas"], "buen_comestible", "low", "Jara y suelos arenosos del oeste ibérico", "Primavera", ["Fonga de terra"], [], ["Sand truffle"], "Trufa del desierto ibérica"),
    ("Terfezia boudieri", ["Criadilla de Boudier"], "Terfeziaceae", ["trufas"], "buen_comestible", "low", "Zonas semiáridas mediterráneas", "Primavera", [], [], ["Boudier's desert truffle"], "Hipogea semiárida"),
    ("Picoa juniperi", ["Trufa de enebro"], "Pezizaceae", ["trufas"], "comestible_con_cautela", "medium", "Enebrales semiáridos", "Primavera", [], [], ["Juniper truffle"], "Asociada a enebros"),
    ("Choiromyces meandriformis", ["Trufa blanca de verano"], "Tuberaceae", ["trufas"], "comestible_con_cautela", "medium", "Bosques silíceos", "Verano–otoño", [], [], ["White truffle (false)"], "No es Tuber magnatum"),
    # --- Polypores / wood ---
    ("Meripilus giganteus", ["Poliporo gigante"], "Meripilaceae", ["otras"], "comestible_con_cautela", "medium", "Bases de hayas y robles", "Verano–otoño", [], [], ["Giant polypore"], "Ennegrece al roce; solo joven"),
    ("Fomitopsis pinicola", ["Yesquero del pino"], "Fomitopsidaceae", ["otras"], "no_recomendado", "low", "Coníferas muertas", "Todo el año", [], [], ["Red-belted conk"], "Medicinal tradicional; corchoso"),
    ("Daedalea quercina", ["Yesquero del roble"], "Fomitopsidaceae", ["otras"], "no_recomendado", "low", "Robles muertos", "Todo el año", [], [], ["Oak mazegill"], "Himenio laberíntico"),
    ("Ganoderma resinaceum", ["Ganoderma resinoso"], "Ganodermataceae", ["medicinales"], "no_recomendado", "low", "Frondosas vivas", "Todo el año", [], [], ["Resinous lacquered polypore"], "Superficie resinosa"),
    ("Lentinus tigrinus", ["Lentinus tigre"], "Polyporaceae", ["otras"], "comestible_con_cautela", "medium", "Sauces y álamos", "Primavera–otoño", [], [], ["Tiger sawgill"], "Sombrero escamado"),
    ("Neolentinus lepideus", ["Lentinus escamoso"], "Gloeophyllaceae", ["otras"], "comestible_con_cautela", "medium", "Madera de coníferas", "Primavera–otoño", [], [], ["Train wrecker"], "Crece en traviesas"),
    ("Pleurotus pulmonarius", ["Seta de ostra pálida"], "Pleurotaceae", ["otras"], "buen_comestible", "low", "Frondosas", "Primavera–otoño", ["Gírgola"], [], ["Phoenix oyster"], "Similar a P. ostreatus"),
    ("Pleurotus dryinus", ["Pleuroto de roble"], "Pleurotaceae", ["otras"], "comestible_con_cautela", "medium", "Robles", "Otoño", [], [], ["Veiled oyster"], "Con velo residual"),
    ("Armillaria ostoyae", ["Armilaria oscura", "Pata de perdiz oscura"], "Physalacriaceae", ["otras"], "comestible_con_cautela", "risky_lookalikes", "Coníferas", "Otoño", [], [], ["Dark honey fungus"], "Parásita agresiva"),
    ("Armillaria tabescens", ["Armilaria sin anillo"], "Physalacriaceae", ["otras"], "comestible_con_cautela", "risky_lookalikes", "Frondosas mediterráneas", "Otoño", [], [], ["Ringless honey fungus"], "Sin anillo"),
    ("Hymenopellis radicata", ["Colibia de raíz", "Oudemansiella radicata"], "Physalacriaceae", ["otras"], "comestible_con_cautela", "medium", "Frondosas", "Verano–otoño", [], [], ["Rooting shank"], "Pie muy radicante"),
    # --- Gasteromycetes ---
    ("Lycoperdon perlatum", ["Cuesco de lobo perlado"], "Agaricaceae", ["otras"], "buen_comestible", "low", "Bosques", "Verano–otoño", ["Pet de llop"], [], ["Common puffball"], "Solo blanco inmaduro"),
    ("Lycoperdon pyriforme", ["Cuesco de lobo piriforme"], "Agaricaceae", ["otras"], "buen_comestible", "low", "Madera podrida", "Otoño", [], [], ["Stump puffball"], "Sobre madera"),
    ("Bovista plumbea", ["Bovista plomiza"], "Agaricaceae", ["otras"], "buen_comestible", "low", "Prados", "Verano–otoño", [], [], ["Grey puffball"], "Esférica de prado"),
    ("Handkea utriformis", ["Cuesco de lobo en forma de odre"], "Agaricaceae", ["otras"], "buen_comestible", "low", "Prados arenosos", "Verano–otoño", [], [], ["Mosaic puffball"], "Grande de pradera"),
    ("Scleroderma citrinum", ["Falso cuesco de lobo amarillo"], "Sclerodermataceae", ["toxicas"], "toxico", "high", "Bosques silíceos", "Verano–otoño", [], [], ["Common earthball"], "Tóxico; confusión con trufas"),
    ("Scleroderma verrucosum", ["Falso cuesco verrugoso"], "Sclerodermataceae", ["toxicas"], "toxico", "high", "Parques y bosques", "Verano–otoño", [], [], ["Scaly earthball"], "Tóxico"),
    ("Geastrum triplex", ["Estrella de tierra collar"], "Geastraceae", ["otras"], "no_recomendado", "low", "Bosques y jardines", "Otoño", [], [], ["Collared earthstar"], "Forma de estrella"),
    ("Astraeus hygrometricus", ["Estrella higrométrica"], "Diplocystaceae", ["otras"], "no_recomendado", "low", "Suelos arenosos mediterráneos", "Todo el año", [], [], ["Barometer earthstar"], "Se abre con humedad"),
    ("Phallus impudicus", ["Falo hediondo", "Huevo del diablo"], "Phallaceae", ["otras"], "comestible_con_cautela", "medium", "Bosques", "Verano–otoño", ["Ou del diable"], [], ["Common stinkhorn"], "Huevo comestible joven; olor fétido adulto"),
    ("Phallus hadriani", ["Falo de Hadrián"], "Phallaceae", ["otras"], "comestible_con_cautela", "medium", "Dunas y arenas costeras", "Verano–otoño", [], [], ["Dune stinkhorn"], "Costero ibérico"),
    ("Clathrus ruber", ["Jaula roja", "Corazón de brujo"], "Phallaceae", ["otras"], "no_recomendado", "medium", "Jardines mediterráneos", "Primavera–otoño", ["Gàbia vermella"], [], ["Red cage"], "Forma de jaula roja"),
    ("Mutinus caninus", ["Falo de perro"], "Phallaceae", ["otras"], "no_recomendado", "medium", "Bosques y jardines", "Verano–otoño", [], [], ["Dog stinkhorn"], "Más delgado que Phallus"),
    ("Battarrea phalloides", ["Battarrea", "Agarico de escamas"], "Agaricaceae", ["otras"], "no_recomendado", "medium", "Zonas áridas y mediterráneas", "Primavera–otoño", [], [], ["Sandy stiltball"], "Pie leñoso alto"),
    ("Montagnea arenaria", ["Montagnea de las arenas"], "Agaricaceae", ["otras"], "no_recomendado", "medium", "Dunas y estepas ibéricas", "Primavera–otoño", [], [], ["Sand montagnea"], "Típica de arenas"),
    # --- Misc common Europe/Iberia ---
    ("Mycena pura", ["Micena pura"], "Mycenaceae", ["toxicas"], "toxico", "high", "Bosques", "Verano–otoño", [], [], ["Lilac bonnet"], "Muscarina; tóxica"),
    ("Mycena rosea", ["Micena rosa"], "Mycenaceae", ["toxicas"], "toxico", "high", "Frondosas", "Otoño", [], [], ["Rosy bonnet"], "Rosa; tóxica"),
    ("Stropharia aeruginosa", ["Estrofaria verde"], "Strophariaceae", ["otras"], "no_recomendado", "medium", "Bosques nitrófilos", "Otoño", [], [], ["Verdigris agaric"], "Verde azulada viscosa"),
    ("Stropharia rugosoannulata", ["Estrofaria de anillo rugoso"], "Strophariaceae", ["otras"], "buen_comestible", "low", "Cultivo y compost", "Primavera–otoño", [], [], ["Wine cap"], "Cultivada"),
    ("Gymnopilus junonius", ["Gymnopilus espectacular"], "Hymenogastraceae", ["toxicas"], "toxico", "high", "Tocones de frondosas", "Otoño", [], [], ["Spectacular rustgill"], "Amarga; tóxica"),
    ("Psathyrella candolleana", ["Psathyrella de Candolle"], "Psathyrellaceae", ["otras"], "comestible_con_cautela", "medium", "Jardines y bordes", "Primavera–otoño", [], [], ["Pale brittlestem"], "Frágil y común"),
    ("Lacrymaria lacrymabunda", ["Lacrimaria"], "Psathyrellaceae", ["otras"], "no_recomendado", "medium", "Caminos y escombros", "Verano–otoño", [], [], ["Weeping widow"], "Láminas que 'lloran'"),
    ("Coprinellus disseminatus", ["Coprino diseminado"], "Psathyrellaceae", ["otras"], "no_recomendado", "low", "Tocones", "Primavera–otoño", [], [], ["Fairy inkcap"], "Cientos de ejemplares juntos"),
    ("Parasola plicatilis", ["Parasola plegada"], "Psathyrellaceae", ["otras"], "no_recomendado", "low", "Céspedes", "Verano–otoño", [], [], ["Pleated inkcap"], "Efémera de hierba"),
    ("Volvopluteus gloiocephalus", ["Volvariella viscosa"], "Pluteaceae", ["otras"], "comestible_con_cautela", "risky_lookalikes", "Restos vegetales", "Otoño–primavera", [], [], ["Stubble rosegill"], "Confusión con amanitas"),
    ("Volvariella bombycina", ["Volvariella sedosa"], "Pluteaceae", ["otras"], "buen_comestible", "risky_lookalikes", "Huecos de frondosas", "Verano–otoño", [], [], ["Silky rosegill"], "Sombrero sedoso dorado"),
    ("Pluteus salicinus", ["Pluteus de sauce"], "Pluteaceae", ["otras"], "no_recomendado", "medium", "Sauces y álamos", "Verano–otoño", [], [], ["Willow shield"], "Tintes azulados"),
    ("Entoloma clypeatum", ["Entoloma de escudo"], "Entolomataceae", ["otras"], "comestible_con_cautela", "risky_lookalikes", "Rosáceas (manzano, espino)", "Primavera", [], [], ["Shield pinkgill"], "Primaveral bajo frutales"),
    ("Entoloma rhodopolium", ["Entoloma grisáceo"], "Entolomataceae", ["toxicas"], "toxico", "high", "Frondosas", "Otoño", [], [], ["Wood pinkgill"], "Tóxico"),
    ("Melanoleuca melaleuca", ["Melanoleuca común"], "Tricholomataceae", ["otras"], "buen_comestible", "low", "Prados y claros", "Otoño–primavera", [], [], ["Common cavalier"], "Láminas blancas, pie fibroso"),
    ("Marasmius scorodonius", ["Marasmius de ajo"], "Marasmiaceae", ["otras"], "buen_comestible", "low", "Coníferas", "Verano–otoño", [], [], ["Garlic parachute"], "Fuerte olor a ajo"),
    ("Gymnopus dryophilus", ["Colibia del roble"], "Omphalotaceae", ["otras"], "comestible_con_cautela", "medium", "Frondosas", "Primavera–otoño", [], [], ["Russet toughshank"], "Muy común"),
    ("Rhodocollybia maculata", ["Colibia manchada"], "Omphalotaceae", ["otras"], "no_recomendado", "medium", "Coníferas", "Otoño", [], [], ["Spotted toughshank"], "Manchas rojizas"),
    ("Agrocybe praecox", ["Agrocybe precoz"], "Strophariaceae", ["otras"], "comestible_con_cautela", "medium", "Céspedes y virutas", "Primavera", [], [], ["Spring fieldcap"], "Una de las primeras de primavera"),
    ("Agrocybe pediades", ["Agrocybe de prado"], "Strophariaceae", ["otras"], "comestible_con_cautela", "medium", "Prados", "Primavera–otoño", [], [], ["Common fieldcap"], "Pequeña de hierba"),
    ("Hypholoma capnoides", ["Hypholoma de coníferas"], "Strophariaceae", ["otras"], "comestible_con_cautela", "risky_lookalikes", "Tocones de coníferas", "Otoño–invierno", [], [], ["Conifer tuft"], "Confusión con H. fasciculare"),
    ("Hypholoma lateritium", ["Hypholoma ladrillo"], "Strophariaceae", ["otras"], "no_recomendado", "medium", "Tocones de frondosas", "Otoño", [], [], ["Brick tuft"], "Sombrero color ladrillo"),
    ("Pholiota aurivella", ["Pholiota dorada"], "Strophariaceae", ["otras"], "no_recomendado", "medium", "Troncos vivos", "Otoño", [], [], ["Golden scalycap"], "Escamas mucilaginosas"),
    ("Hebeloma sinapizans", ["Hebeloma nabo"], "Hymenogastraceae", ["toxicas"], "toxico", "high", "Bosques", "Otoño", [], [], ["Bitter poisonpie"], "Olor a rábano; tóxica"),
    ("Tremella mesenterica", ["Tremella amarilla", "Caspa de bruja"], "Tremellaceae", ["otras"], "comestible_con_cautela", "low", "Ramas de frondosas", "Todo el año (húmedo)", [], [], ["Yellow brain"], "Gelatinosa amarilla"),
    ("Exidia glandulosa", ["Exidia glandulosa", "Bruja negra"], "Auriculariaceae", ["otras"], "no_recomendado", "low", "Robles muertos", "Invierno", [], [], ["Witches' butter (black)"], "Gelatinosa negra"),
    ("Calocera viscosa", ["Calocera viscosa"], "Dacrymycetaceae", ["otras"], "no_recomendado", "low", "Coníferas podridas", "Todo el año", [], [], ["Yellow stagshorn"], "Ramificada gelatinosa"),
    ("Chlorociboria aeruginascens", ["Ciboria verde"], "Chlorociboriaceae", ["otras"], "no_recomendado", "low", "Madera de roble teñida de verde", "Todo el año", [], [], ["Green elfcup"], "Tiñe la madera de verde"),
    ("Sparassis brevipes", ["Sparassis de conífera"], "Sparassidaceae", ["otras"], "buen_comestible", "low", "Pinos y abetos", "Otoño", [], [], ["Short-stemmed cauliflower"], "Similar a S. crispa"),
    ("Albatrellus ovinus", ["Albatrellus ovino"], "Albatrellaceae", ["otras"], "buen_comestible", "low", "Piceas de montaña", "Verano–otoño", [], [], ["Sheep polypore"], "Carne que amarillea"),
    ("Ramaria formosa", ["Ramaria hermosa"], "Gomphaceae", ["toxicas"], "toxico", "high", "Frondosas", "Verano–otoño", [], [], ["Beautiful clavaria"], "Purgantes; no consumir"),
    ("Ramaria flava", ["Ramaria amarilla"], "Gomphaceae", ["otras"], "comestible_con_cautela", "risky_lookalikes", "Frondosas", "Verano–otoño", [], [], ["Yellow coral"], "Confusión con R. formosa"),
    ("Clavariadelphus pistillaris", ["Clavariadelphus mazo"], "Clavariadelphaceae", ["otras"], "no_recomendado", "medium", "Frondosas calcáreas", "Otoño", [], [], ["Pestle-shaped coral"], "Forma de mazo"),
    ("Sarcodon squamosus", ["Sarcodon escamoso", "Pata de perdiz de pino"], "Bankeraceae", ["otras"], "buen_comestible", "low", "Pinares", "Otoño", [], [], ["Scaly tooth"], "Aguijones; de pinares"),
    ("Phellodon niger", ["Phellodon negro"], "Bankeraceae", ["otras"], "no_recomendado", "low", "Bosques", "Otoño", [], [], ["Black tooth"], "Negro-grisáceo"),
    ("Bankera fuligineoalba", ["Bankera"], "Bankeraceae", ["otras"], "no_recomendado", "low", "Pinares", "Otoño", [], [], ["Drab tooth"], "Aguijones de pinar"),
    ("Agaricus moelleri", ["Champiñón de Möller", "Champiñón de olor desagradable"], "Agaricaceae", ["toxicas"], "toxico", "high", "Parques y bosques", "Verano–otoño", [], [], ["Inky mushroom"], "Amarillea; olor a tinta/yodo"),
    ("Amanita codinae", ["Amanita de Codina"], "Amanitaceae", ["amanitas"], "desconocido", "medium", "Mediterráneo ibérico", "Otoño", [], [], ["Codina's amanita"], "Taxón mediterráneo"),
    ("Lactarius zonarius", ["Lactario zonado"], "Russulaceae", ["lactarius"], "no_recomendado", "medium", "Robles mediterráneos", "Otoño", [], [], ["Zoned milkcap"], "Zonas concéntricas"),
    ("Lactarius chrysorrheus", ["Lactario de leche amarilla"], "Russulaceae", ["lactarius"], "no_recomendado", "medium", "Robledales", "Otoño", [], [], ["Yellowdrop milkcap"], "Látex que amarillea"),
    ("Russula cessans", ["Rúsula de pino"], "Russulaceae", ["russulas"], "buen_comestible", "low", "Pinares", "Otoño", [], [], ["Late brittlegill"], "De pinares"),
    ("Suillus fluryi", ["Suillus de Flury"], "Suillaceae", ["boletus"], "buen_comestible", "low", "Pinares de pino silvestre", "Otoño", [], [], ["Flury's bolete"], "Pinares de montaña"),
    ("Boletus torosus", ["Boleto toroso"], "Boletaceae", ["boletus", "toxicas"], "toxico", "high", "Encinares mediterráneos", "Otoño", [], [], ["Boletus torosus"], "Azulea; se considera tóxico"),
    ("Rubroboletus legaliae", ["Boleto de Legal"], "Boletaceae", ["boletus", "toxicas"], "toxico", "high", "Robles y castaños", "Verano–otoño", [], [], ["Legal's bolete"], "Rojo; tóxico"),
    ("Amanita nivalis", ["Amanita nival"], "Amanitaceae", ["amanitas"], "desconocido", "medium", "Alta montaña", "Verano", [], [], ["Snow amanita"], "Alpina"),
    ("Hygrophorus persoonii", ["Llenega", "Higróforo de Persoon"], "Hygrophoraceae", ["otras"], "buen_comestible", "low", "Encinares y robledales mediterráneos", "Otoño–invierno", ["Llenega"], [], ["Person's woodwax"], "Llenega mediterránea"),
    ("Cantharellus subpruinosus", ["Rebozuelo subpruinoso"], "Cantharellaceae", ["cantharellus"], "excelente", "low", "Frondosas mediterráneas", "Otoño", ["Rossinyol"], [], ["Pruinose chanterelle"], "Mediterráneo"),
    ("Craterellus lutescens", ["Angula de monte", "Trompetilla amarilla"], "Cantharellaceae", ["cantharellus"], "excelente", "low", "Pinares y abetales", "Otoño", ["Camagroc"], [], ["Yellow foot"], "Muy apreciada en Cataluña"),
    ("Lactarius sanguifluus", ["Nízcalo de sangre", "Rovellón de sangre"], "Russulaceae", ["lactarius"], "excelente", "low", "Pinares mediterráneos", "Otoño", ["Rovelló de sang"], ["Odolezko esne-ziza"], ["Bloody milkcap"], "Látex rojo vino"),
]


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def main() -> int:
    existing: set[str] = set()
    if EXISTING.exists():
        data = json.loads(EXISTING.read_text(encoding="utf-8"))
        existing = {s["scientific_name"] for s in data.get("species", [])}

    species = []
    seen: set[str] = set()
    for row in RAW:
        (
            sci,
            es_names,
            family,
            cats,
            edib,
            risk,
            habitat,
            season,
            ca,
            eu,
            en,
            tagline,
        ) = row
        if sci in seen:
            continue
        seen.add(sci)
        if sci in existing:
            # still include as layer candidate; merge will dedupe
            pass
        vern = {
            "es": es_names,
            "ca": ca or [],
            "eu": eu or [],
            "en": en or [],
        }
        # guarantee ES
        if not vern["es"]:
            vern["es"] = [sci]
        # high/deadly fill all locales
        if risk in ("deadly", "high") or edib in ("mortifero", "toxico"):
            seed = vern["es"]
            for loc in ("ca", "eu", "en"):
                if not vern[loc]:
                    vern[loc] = list(seed) if loc != "en" else (en or seed[:1])

        rec = {
            "scientific_name": sci,
            "slug": slugify(sci),
            "family": family,
            "genus": sci.split()[0],
            "risk_level": risk,
            "edibility_code": edib,
            "categories": cats,
            "iberian_relevance": "high",
            "featured": sci
            in {
                "Amanita ponderosa",
                "Hygrophorus marzuolus",
                "Lepista nuda",
                "Suillus bellinii",
                "Lactarius sanguifluus",
                "Terfezia arenaria",
                "Leccinellum lepidum",
                "Hygrophorus latitabundus",
            },
            "icon": "🍄",
            "vernacular_names": vern,
            "tagline": {"es": tagline},
            "description": {
                "es": f"{sci}. {tagline}. Hábitat: {habitat}. Temporada: {season}. "
                f"Información educativa; nunca consumir basándose solo en una app."
            },
            "morphology": {
                "cap": {"es": ""},
                "stem": {"es": ""},
                "hymenium": {"es": ""},
            },
            "habitat": {"es": habitat},
            "season": {"es": season},
            "key_features": {"es": []},
            "toxicity_notes": {},
            "lookalikes": [],
            "source": "iberia_common_curated",
        }
        if edib in ("mortifero", "toxico"):
            rec["toxicity_notes"] = {
                "es": "Especie de riesgo toxicológico. No consumir. Confirmar siempre con experto."
            }
        species.append(rec)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "layer": "iberia_common",
        "version": "1.0.0",
        "count": len(species),
        "species": species,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    new_only = [s for s in species if s["scientific_name"] not in existing]
    print(f"Wrote {OUT} total={len(species)} new_vs_current_catalog={len(new_only)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
