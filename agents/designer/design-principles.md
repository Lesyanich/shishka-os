# Design Principles — Shishka

Семь принципов, на которые сверяемся перед тем как закрыть макет.

## 1. Honest materials over visual tricks
Бренд строится на настоящей еде. В интерфейсах — настоящие данные, настоящие фото, настоящие цифры. Плейсхолдеры ("Lorem ipsum", dummy photos) — только если их видно <5 секунд.

## 2. Legibility before mood
Красиво ≠ читаемо. Если стоит выбор — жертвуем декором. Alegreya выглядит магически на 48px, но если строка бизнес-критичная и на 12px — Geist.

## 3. Hierarchy by scarcity
Если всё "важное", то ничего не важно. На каждой странице — один primary focus (кнопка, heading, метрика). Всё остальное поддерживает его.

## 4. Dark is a choice, not a reflex
Admin-panel — dark, потому что владельцы часто смотрят на неё в вечерний service. Customer-facing (меню, website) — чаще cream/paper. Каждый раз задаём вопрос: "кто смотрит, при каком свете, в каком контексте?"

## 5. Motion explains state change
Анимации нужны, только если они объясняют, что произошло. Rotation/slide/fade — ок. Particle effects, wiggle, bounce — нет. 220ms — верхняя граница для большинства переходов.

## 6. Craft earns trust
Детали, которые пользователь не заметит сознательно, но почувствует: правильный inter-character spacing в логотипе, honest copy ("3 tasks waiting" вместо "you have some todos"), иконка с правильным optical weight, graceful empty states. Это то, что отличает Pinterest-уровень от дефолта.

## 7. Serve the business, not the ego
Каждое визуальное решение должно отвечать на вопрос "как это помогает Shishka открыться / продать больше / работать быстрее?". Если не помогает — вырезаем. Арт-директор ≠ арт-свободный радикал.
