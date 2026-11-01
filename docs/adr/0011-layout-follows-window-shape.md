# The layout follows the window's shape, in CSS: a side column when landscape and at least 600 px wide, a top bar otherwise

The Answering page and the Review page (and the Showcase page, which is a Review page) have two layouts. When the window is landscape (wider than tall) and at least 600 CSS pixels wide, a column on the left holds what must stay at hand: on the Answering page the Question number, the timers with the time correction, the Question navigation and Submit; on the Review page the score, the Question navigation coloured by result, and the Digest controls. Otherwise, a one-line bar fixed at the top holds the Question number and the timers, and the navigation drops down from it. A square window counts as portrait.

The switch is a CSS media query on the window, not a JavaScript check, so the right layout shows from the first paint and changes at once when a phone or tablet is turned or a window resized. The side column is `position: sticky` inside the block that holds the Questions: it stays in view while the Questions scroll and leaves with them when they end, and scrolls on its own when it is taller than the window.

## Considered Options

- **Split by width alone (desktop and mobile)**: rejected. A phone turned sideways is wide but only about 390 px tall; a top bar would take height from the Question, while a side column leaves it the whole height.
- **Split by orientation alone**: rejected. A landscape window narrower than 600 px leaves too little room beside the column; such windows get the top bar.
- **Scaling the desktop layout down on small screens**: rejected. Text and Options become too small to read and tap.
- **Choosing the layout in JavaScript**: rejected. The page can show the wrong layout before the check runs, and every resize and rotation must be listened for.
