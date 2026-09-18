import { newProduct } from './product-pricing.js';

export function defaultBusinessCardPackages() {
  return [
    { id:'essential', name:'Essential', description:'เรียบง่าย แต่ดูเป็นมืออาชีพ', tagline:'เรียบง่าย แต่ดูเป็นมืออาชีพ', quantity:100, price:123.24, print:'single', laminate:'none', recommended:false, bullets:['กระดาษอาร์ตด้าน 300 แกรม','พิมพ์ 4 สี','ขนาดมาตรฐานยอดนิยม'], suitable:'SME / Freelancer / Startup ทั่วไป', optionIds:[] },
    { id:'corporate', name:'Corporate', description:'น่าเชื่อถือ เหมาะกับองค์กร', tagline:'น่าเชื่อถือ เหมาะกับองค์กร', quantity:500, price:1396.20, print:'double', laminate:'matte', recommended:true, bullets:['กระดาษอาร์ตด้าน 300 แกรม','พิมพ์ 4 สี 2 ด้าน','เคลือบด้าน / ผิวสัมผัสเรียบหรู'], suitable:'บริษัทจำกัด / องค์กรขนาดใหญ่ / ฝ่ายขาย', optionIds:[] },
    { id:'signature', name:'Signature', description:'สร้างความต่างสูงสุดตั้งแต่แรกสัมผัส', tagline:'สร้างความต่างสูงสุดตั้งแต่แรกสัมผัส', quantity:1000, price:2792.40, print:'double', laminate:'gloss', recommended:false, bullets:['กระดาษพรีเมียม','พิมพ์ 4 สี 2 ด้าน','เคลือบเงา สีสดเด่น'], suitable:'ผู้บริหาร / Creative Studio / Luxury Brand', optionIds:[] }
  ];
}

export function newBusinessCardProduct() {
  return {
    ...newProduct('business-card', 'นามบัตร'),
    mode: 'packages',
    packages: defaultBusinessCardPackages()
  };
}
