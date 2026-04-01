# Проверка соответствия описаний заклинаний

- Файл базы: `spells_srd_db.json`
- Метод: сравнение объёма `description_en` и `description_ru` по количеству слов.
- Всего заклинаний: **319**
- Среднее отношение объёма RU/EN: **0.157**
- Записей с RU/EN < 0.35: **300**

## Вывод
Большинство `description_ru` заметно короче `description_en`, то есть сейчас это в основном краткие пересказы, а не полные эквивалентные переводы.

## Примеры наименьшего соответствия (по объёму)
| Заклинание | слов EN | слов RU | RU/EN |
|---|---:|---:|---:|
| Prismatic Wall | 714 | 14 | 0.020 |
| Symbol | 639 | 13 | 0.020 |
| Shapechange | 449 | 12 | 0.027 |
| Teleport | 608 | 17 | 0.028 |
| Wish | 534 | 15 | 0.028 |
| Imprisonment | 563 | 17 | 0.030 |
| True Polymorph | 494 | 15 | 0.030 |
| Planar Ally | 405 | 13 | 0.032 |
| Hallow | 423 | 14 | 0.033 |
| Glyph of Warding | 558 | 19 | 0.034 |
| Control Water | 565 | 20 | 0.035 |
| Modify Memory | 367 | 13 | 0.035 |
| Guards and Wards | 449 | 16 | 0.036 |
| Magic Jar | 432 | 16 | 0.037 |
| Seeming | 244 | 10 | 0.041 |
| Major Image | 284 | 12 | 0.042 |
| Mass Suggestion | 280 | 12 | 0.043 |
| Earthquake | 386 | 17 | 0.044 |
| Wall of Stone | 309 | 14 | 0.045 |
| Animate Objects | 462 | 21 | 0.045 |
