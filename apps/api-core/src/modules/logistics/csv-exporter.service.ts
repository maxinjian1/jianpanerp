import { Injectable, Logger } from '@nestjs/common';
import * as iconv from 'iconv-lite';
import { stringify } from 'csv-stringify/sync';

interface OrderForExport {
  id: string;
  externalOrderId: string;
  customerName: string;
  customerPhone: string;
  shippingZipCode: string;
  shippingPrefecture: string;
  shippingCity: string;
  shippingAddress1: string;
  shippingAddress2?: string | null;
  companyName?: string | null;
  deliveryDate?: Date | null;
  deliveryTimeSlot?: string | null;
  paymentMethod: string;
  totalAmount: number;
  items: {
    name: string;
    quantity: number;
  }[];
}

interface ShipperInfo {
  name: string;
  phone: string;
  zipCode: string;
  prefecture: string;
  city: string;
  address: string;
}

@Injectable()
export class CsvExporterService {
  private readonly logger = new Logger(CsvExporterService.name);

  /**
   * 佐川急便 e-飛伝II用CSV生成
   * Generate CSV for Sagawa e-Hiden II format
   */
  generateSagawaCsv(orders: OrderForExport[], shipper: ShipperInfo): Buffer {
    this.logger.log(`Generating Sagawa CSV for ${orders.length} orders`);

    const rows = orders.map((order) => ({
      '住所録コード': '',
      'お届け先電話番号': this.formatPhone(order.customerPhone),
      'お届け先郵便番号': order.shippingZipCode.replace('-', ''),
      'お届け先住所１': order.shippingPrefecture + order.shippingCity,
      'お届け先住所２': order.shippingAddress1,
      'お届け先住所３': order.shippingAddress2 || '',
      'お届け先名': order.customerName,
      'お届け先名カナ': '',
      '依頼主電話番号': this.formatPhone(shipper.phone),
      '依頼主郵便番号': shipper.zipCode.replace('-', ''),
      '依頼主住所１': shipper.prefecture + shipper.city,
      '依頼主住所２': shipper.address,
      '依頼主名': shipper.name,
      '品名１': this.truncate(order.items.map(i => i.name).join('、'), 30),
      '品名２': '',
      '個数': '1',
      '重量': '',
      '配達日': this.formatDate(order.deliveryDate),
      '配達時間帯': this.mapTimeSlotToSagawa(order.deliveryTimeSlot),
      '代引き金額': order.paymentMethod === 'COD' ? String(order.totalAmount) : '',
      'お届け先コード': '',
      'お客様管理番号': order.externalOrderId,
      '請求先コード': '',
      '運賃管理番号': '',
      '元着区分': '0', // 元払い
      '記事': '',
    }));

    const csvString = stringify(rows, {
      header: true,
      quoted: true,
    });

    // Convert to Shift-JIS (critical for Japanese logistics systems!)
    return iconv.encode(csvString, 'Shift_JIS');
  }

  /**
   * ヤマト運輸 B2クラウド用CSV生成
   * Generate CSV for Yamato B2 Cloud format
   */
  generateYamatoCsv(orders: OrderForExport[], shipper: ShipperInfo): Buffer {
    this.logger.log(`Generating Yamato CSV for ${orders.length} orders`);

    const rows = orders.map((order) => ({
      'お届け先電話番号': this.formatPhone(order.customerPhone),
      'お届け先郵便番号': order.shippingZipCode.replace('-', ''),
      'お届け先住所': `${order.shippingPrefecture}${order.shippingCity}${order.shippingAddress1}`,
      'お届け先会社・部門１': order.companyName || '',
      'お届け先会社・部門２': '',
      'お届け先名': order.customerName,
      'お届け先名略称カナ': '',
      'ご依頼主電話番号': this.formatPhone(shipper.phone),
      'ご依頼主郵便番号': shipper.zipCode.replace('-', ''),
      'ご依頼主住所': `${shipper.prefecture}${shipper.city}${shipper.address}`,
      'ご依頼主名': shipper.name,
      'ご依頼主名略称カナ': '',
      '品名１': this.truncate(order.items[0]?.name || '商品', 25),
      '品名２': order.items.length > 1 ? '他' : '',
      '荷扱い１': '',
      '荷扱い２': '',
      'お届け予定日': this.formatDateYamato(order.deliveryDate),
      '配達時間帯': this.mapTimeSlotToYamato(order.deliveryTimeSlot),
      '送り状種類': order.paymentMethod === 'COD' ? '4' : '0', // 0:通常, 4:代引き
      'コレクト代金引換額（税込）': order.paymentMethod === 'COD' ? String(order.totalAmount) : '',
      'コレクト内消費税額等': '',
      'クロネコＤＭ便': '0',
      '営業所止置き': '0',
      'ご請求先顧客コード': '',
      'ご請求先分類コード': '',
      '運賃管理番号': '',
      'お届け先コード': '',
      'お届け先電話番号枝番': '',
      'お客様管理番号': order.externalOrderId,
      'お届け先メールアドレス': '',
      '入力機種': '',
      '配達完了通知': '',
    }));

    const csvString = stringify(rows, {
      header: true,
      quoted: true,
    });

    return iconv.encode(csvString, 'Shift_JIS');
  }

  /**
   * 福山通運用CSV生成
   * Generate CSV for Fukuyama Express format
   */
  generateFukuyamaCsv(orders: OrderForExport[], shipper: ShipperInfo): Buffer {
    this.logger.log(`Generating Fukuyama CSV for ${orders.length} orders`);

    const rows = orders.map((order) => ({
      '荷送人コード': '',
      '届先コード': '',
      '届先電話番号': this.formatPhone(order.customerPhone),
      '届先郵便番号': order.shippingZipCode,
      '届先住所1': order.shippingPrefecture + order.shippingCity,
      '届先住所2': order.shippingAddress1 + (order.shippingAddress2 || ''),
      '届先会社名': order.companyName || '',
      '届先担当者': order.customerName,
      '個数': '1',
      '重量': '',
      '配達指定日': this.formatDate(order.deliveryDate),
      '配達時間': this.mapTimeSlotToFukuyama(order.deliveryTimeSlot),
      '運賃区分': '1', // 元払い
      '荷札メッセージ': this.truncate(order.items.map(i => i.name).join('、'), 40),
      'お客様管理番号': order.externalOrderId,
    }));

    const csvString = stringify(rows, {
      header: true,
      quoted: true,
    });

    return iconv.encode(csvString, 'Shift_JIS');
  }

  /**
   * 日本郵便 ゆうパック用CSV生成
   * Generate CSV for Japan Post Yu-Pack format
   */
  generateJapanPostCsv(orders: OrderForExport[], shipper: ShipperInfo): Buffer {
    this.logger.log(`Generating Japan Post CSV for ${orders.length} orders`);

    const rows = orders.map((order) => ({
      'お届け先郵便番号': order.shippingZipCode,
      'お届け先住所': `${order.shippingPrefecture}${order.shippingCity}${order.shippingAddress1}${order.shippingAddress2 || ''}`,
      'お届け先氏名': order.customerName,
      'お届け先電話番号': this.formatPhone(order.customerPhone),
      'ご依頼主郵便番号': shipper.zipCode,
      'ご依頼主住所': `${shipper.prefecture}${shipper.city}${shipper.address}`,
      'ご依頼主氏名': shipper.name,
      'ご依頼主電話番号': this.formatPhone(shipper.phone),
      '品名': this.truncate(order.items.map(i => i.name).join('、'), 30),
      '配達希望日': this.formatDateJP(order.deliveryDate),
      '配達希望時間帯': this.mapTimeSlotToJP(order.deliveryTimeSlot),
      '代金引換': order.paymentMethod === 'COD' ? '1' : '0',
      '代金引換金額': order.paymentMethod === 'COD' ? String(order.totalAmount) : '',
      'お客様管理番号': order.externalOrderId,
    }));

    const csvString = stringify(rows, {
      header: true,
      quoted: true,
    });

    return iconv.encode(csvString, 'Shift_JIS');
  }

  // ========================================
  // Helper methods
  // ========================================

  private formatPhone(phone: string): string {
    return phone.replace(/-/g, '').replace(/\s/g, '');
  }

  private formatDate(date?: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }

  private formatDateYamato(date?: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  private formatDateJP(date?: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 1) + '…';
  }

  private mapTimeSlotToSagawa(slot?: string | null): string {
    if (!slot) return '';
    const mapping: Record<string, string> = {
      '0812': '01', // 午前中
      '1214': '02', // 12-14時
      '1416': '03', // 14-16時
      '1618': '04', // 16-18時
      '1820': '05', // 18-20時
      '1921': '06', // 19-21時
    };
    return mapping[slot] || '';
  }

  private mapTimeSlotToYamato(slot?: string | null): string {
    if (!slot) return '0';
    const mapping: Record<string, string> = {
      '0812': '0812',
      '1214': '1416', // Yamato doesn't have 12-14
      '1416': '1416',
      '1618': '1618',
      '1820': '1820',
      '1921': '1921',
    };
    return mapping[slot] || '0';
  }

  private mapTimeSlotToFukuyama(slot?: string | null): string {
    if (!slot) return '';
    const mapping: Record<string, string> = {
      '0812': 'AM',
      '1214': 'PM1',
      '1416': 'PM1',
      '1618': 'PM2',
      '1820': 'PM2',
      '1921': 'EVE',
    };
    return mapping[slot] || '';
  }

  private mapTimeSlotToJP(slot?: string | null): string {
    if (!slot) return '';
    const mapping: Record<string, string> = {
      '0812': '0812',
      '1214': '1214',
      '1416': '1416',
      '1618': '1618',
      '1820': '1820',
      '1921': '1921',
    };
    return mapping[slot] || '';
  }
}

