// Контекстна панель біля вибраного солдата: кнопки «Підняти…», «Кинути», «Вогонь!».
// Показуємо лише ті кнопки, які зараз можна натиснути (зайві приховані — так у ТЗ).

export interface PanelButton {
  label: string;
  onClick(): void;
  style?: 'fire' | 'cancel' | 'rescue';
}

export class ActionPanel {
  private root: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'action-panel';
    parent.append(this.root);
  }

  // Замінити кнопки. Порожній список — панель ховається.
  setButtons(buttons: PanelButton[]): void {
    this.root.replaceChildren(
      ...buttons.map((b) => {
        const button = document.createElement('button');
        button.textContent = b.label;
        if (b.style) button.classList.add(b.style);
        button.addEventListener('click', b.onClick);
        return button;
      }),
    );
    this.root.classList.toggle('visible', buttons.length > 0);
  }

  // Поставити панель над точкою екрана (x, y — пікселі), наприклад над головою солдата
  moveTo(x: number, y: number): void {
    // Не даємо панелі вилізти за край екрана
    const margin = 8;
    const halfWidth = this.root.offsetWidth / 2;
    const parent = this.root.parentElement!;
    const left = Math.min(Math.max(x, halfWidth + margin), parent.clientWidth - halfWidth - margin);
    const top = Math.max(y, this.root.offsetHeight + margin);
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }
}
