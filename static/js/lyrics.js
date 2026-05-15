/**
 * MusicPlayer — 歌词解析与同步模块
 * 支持双语歌词：英文行+中文翻译行合并显示，英文优先
 */

class LyricsManager {
  constructor() {
    this.lines = [];          // { time, text, chars, isEnglish, isChinese }
    this.currentLine = -1;
    this.onLyricsUpdate = null;
    this.onLineChange = null;
    this.onDataReady = null;  // 歌词数据加载完成回调
  }

  parse(lrcText) {
    if (!lrcText || typeof lrcText !== 'string') {
      this.lines = [];
      return [];
    }

    const rawLines = lrcText.split(/\r?\n/);
    const tempLines = [];

    for (const raw of rawLines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      const timeRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{2,3}))?\]/g;
      const times = [];
      let match;
      while ((match = timeRegex.exec(trimmed)) !== null) {
        const min = parseInt(match[1]);
        const sec = parseInt(match[2]);
        let ms = match[3] ? parseInt(match[3]) : 0;
        if (ms < 100) ms *= 10;
        times.push(min * 60 + sec + ms / 1000);
      }

      const text = trimmed.replace(/\[.*?\]/g, '').trim();
      if (!text || times.length === 0) continue;

      const hasChinese = /[\u4e00-\u9fff]/.test(text);
      const hasEnglish = /[a-zA-Z]{2,}/.test(text);

      if (hasChinese && hasEnglish) {
        // 同一行中英文混合：拆分为英文+中文
        const { enPart, zhPart } = splitMixedLine(text);
        for (const time of times) {
          tempLines.push({ time, text: enPart, isEnglish: true, isChinese: false });
          if (zhPart) tempLines.push({ time, text: zhPart, isEnglish: false, isChinese: true });
        }
      } else {
        for (const time of times) {
          tempLines.push({
            time, text,
            isEnglish: hasEnglish && !hasChinese,
            isChinese: hasChinese && !hasEnglish
          });
        }
      }
    }

    tempLines.sort((a, b) => a.time - b.time);

    // 合并相同时刻的中英文行为双语对
    this.lines = this._mergeBilingual(tempLines);

    if (this.onDataReady) this.onDataReady(this.lines);
    return this.lines;
  }

  /**
   * 将相邻且时间相同的英文行和中文行合并为双语行对
   * 英文在上，中文在下
   */
  _mergeBilingual(tempLines) {
    const result = [];
    let i = 0;

    while (i < tempLines.length) {
      const line = tempLines[i];

      // 查找下一行是否同样时间、是中英互补
      const next = tempLines[i + 1];
      if (next && Math.abs(next.time - line.time) < 0.05) {
        // 两个同一时间的行
        if (line.isEnglish && next.isChinese) {
          // 英文+中文合并
          result.push({
            time: line.time,
            text: line.text,
            subText: next.text,  // 中文翻译
            chars: this._splitChars(line.text),
            isBilingual: true,
            isEnglish: true,
            isChinese: false
          });
          i += 2;
          continue;
        }
        if (line.isChinese && next.isEnglish) {
          // 中文+英文合并
          result.push({
            time: next.time,
            text: next.text,
            subText: line.text,
            chars: this._splitChars(next.text),
            isBilingual: true,
            isEnglish: true,
            isChinese: false
          });
          i += 2;
          continue;
        }
      }

      // 单行
      result.push({
        time: line.time,
        text: line.text,
        subText: '',
        chars: this._splitChars(line.text),
        isBilingual: false,
        isEnglish: line.isEnglish,
        isChinese: line.isChinese
      });
      i++;
    }

    return result;
  }

  _splitChars(text) {
    const chars = [];
    // 正则：英文单词 | 中文字符 | 数字 | 空白 | 标点符号
    // 把英文单词作为一个整体，中文逐字，保留空格和标点
    const pattern = /([a-zA-Z]+|[0-9]+|[\u4e00-\u9fff\u3400-\u4dbf]|\s+|[^\w\s])/g;
    const parts = [];
    let m;
    while ((m = pattern.exec(text)) !== null) {
      parts.push(m[1]);
    }
    for (const p of parts) {
      if (/^[a-zA-Z0-9]+$/.test(p)) {
        // 英文单词 / 数字 — 整体
        chars.push({ char: p, sung: false });
      } else if (/^\s+$/.test(p)) {
        // 空格 — 保留间距
        chars.push({ char: p, sung: false });
      } else {
        // 中文逐字 / 标点
        for (const c of p) {
          chars.push({ char: c, sung: false });
        }
      }
    }
    return chars;
  }

  sync(time) {
    if (this.lines.length === 0) return -1;

    // 提前0.5秒匹配下一行（让歌词提前入场）
    const adjustedTime = time + 0.5;

    let lineIdx = -1;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (adjustedTime >= this.lines[i].time) {
        lineIdx = i;
        break;
      }
    }

    if (lineIdx !== this.currentLine) {
      this.currentLine = lineIdx;
      if (this.onLineChange && lineIdx >= 0) {
        this.onLineChange(lineIdx, this.lines[lineIdx]);
      }
    }

    if (lineIdx >= 0 && lineIdx < this.lines.length) {
      const line = this.lines[lineIdx];
      const nextLine = this.lines[lineIdx + 1];
      const lineEnd = nextLine ? nextLine.time : (line.time + 5);
      const lineDuration = Math.max(0.1, lineEnd - line.time);
      // 逐字进度用真实时间算（不受0.5s提前影响）
      const elapsed = time - line.time;
      const progress = Math.min(1, Math.max(0, elapsed / lineDuration));

      const totalChars = line.chars.length;
      const sungCount = Math.floor(progress * totalChars);
      line.chars.forEach((c, i) => {
        c.sung = i < sungCount;
      });
      line.progress = progress;
    }

    return lineIdx;
  }

  getContextLines(currentIdx, range) {
    const result = [];
    for (let i = currentIdx - range; i <= currentIdx + range; i++) {
      if (i >= 0 && i < this.lines.length) {
        result.push({ index: i, line: this.lines[i] });
      }
    }
    return result;
  }

  seekToTime(time) {
    const adjusted = time + 0.5;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (adjusted >= this.lines[i].time) {
        this.currentLine = i;
        return i;
      }
    }
    return -1;
  }

  getCurrentLine() {
    if (this.currentLine < 0 || this.currentLine >= this.lines.length) return null;
    return this.lines[this.currentLine];
  }

  getLineAt(index) {
    if (index < 0 || index >= this.lines.length) return null;
    return this.lines[index];
  }

  clear() {
    this.lines = [];
    this.currentLine = -1;
  }

  isEmpty() {
    return this.lines.length === 0;
  }
}

/**
 * 拆分同一行中的中英文混合文本
 * 如 "Hello World 你好世界" → { enPart: "Hello World", zhPart: "你好世界" }
 */
function splitMixedLine(text) {
  // 尝试按空格分隔，分别归类英文词和中文词
  const parts = text.split(/\s+/);
  const enWords = [];
  const zhWords = [];
  for (const p of parts) {
    if (!p) continue;
    if (/[\u4e00-\u9fff]/.test(p)) {
      zhWords.push(p);
    } else if (/[a-zA-Z]/.test(p)) {
      enWords.push(p);
    } else {
      // 纯数字/符号，归入英文侧
      enWords.push(p);
    }
  }
  // 如果没有明确分隔，用正则提取
  if (enWords.length === 0 && zhWords.length === 0) {
    const enMatch = text.match(/[a-zA-Z0-9\s.,!?;:'"()\-]+/g);
    const zhMatch = text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g);
    return {
      enPart: enMatch ? enMatch.join(' ').trim() : '',
      zhPart: zhMatch ? zhMatch.join('').trim() : ''
    };
  }
  return {
    enPart: enWords.join(' '),
    zhPart: zhWords.join(' ')
  };
}

const lyrics = new LyricsManager();
