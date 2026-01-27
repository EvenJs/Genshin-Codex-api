import { Injectable, Logger } from '@nestjs/common';
import { createWorker, Worker, OEM, PSM } from 'tesseract.js';
import { parseArtifactOcrText } from './artifact-ocr-parser';
import { OcrArtifactResult } from './dto/ocr-result.dto';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private worker: Worker | null = null;

  async processArtifactImage(imageBuffer: Buffer): Promise<OcrArtifactResult> {
    const worker = await this.getWorker();

    try {
      this.logger.debug('Starting OCR processing...');

      const {
        data: { text, confidence },
      } = await worker.recognize(imageBuffer);

      this.logger.debug(`OCR completed with confidence: ${confidence}%`);
      this.logger.debug(`Raw OCR text: ${text}`);

      const result = parseArtifactOcrText(text);

      // Adjust overall confidence based on Tesseract confidence
      result.overallConfidence = (result.overallConfidence * (confidence / 100) + confidence / 100) / 2;

      return result;
    } catch (error) {
      this.logger.error(`OCR processing failed: ${error}`);
      throw error;
    }
  }

  private async getWorker(): Promise<Worker> {
    if (!this.worker) {
      this.logger.debug('Initializing Tesseract worker with Chinese + English...');

      this.worker = await createWorker('chi_sim+eng', OEM.DEFAULT, {
        logger: (m) => this.logger.verbose(`Tesseract: ${JSON.stringify(m)}`),
      });

      // Configure for better recognition of game UI text
      await this.worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        tessedit_char_whitelist:
          '0123456789+.%' +
          '生命值攻击力防御力元素精通充能效率暴击率伤害治疗加成' +
          '火水雷冰风岩草物理' +
          '角斗士终幕礼流浪大地乐团昔日宗室仪染血骑士道翠绿之影' +
          '炽烈炎魔女如雷盛怒冰风迷途勇士沉沦心千岩牢固苍白火' +
          '追忆注连绝缘旗印华馆梦醒形骸记海染砗磲辰砂往生录来歆余响' +
          '深林记忆饰金梦沙上楼阁史话乐园遗落花水仙甘露光逐影猎人' +
          '黄金剧团昔时歌回声林夜话谐律异想断章未竟遐思烬城绘卷黑曜秘典' +
          '悠古磐岩逆飞流星平息鸣尊者渡过烈贤人被怜爱少女战狂教官' +
          '流放者行者心武人守护奇迹勇士赌徒学士游医幸运儿冒险家' +
          '之花羽沙杯冠★☆⭐',
      });

      this.logger.debug('Tesseract worker initialized');
    }

    return this.worker;
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
