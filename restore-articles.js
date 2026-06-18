#!/usr/bin/env node

/**
 * restore-articles.js
 * Restores accidentally updated articles back to original titles
 * Run this to undo the wrong updates
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2));
const DRY_RUN = args['dry-run'] === true || args.dry === true;
const HEADLESS = args.headless !== false;

const { LOGIN_URL, ADMIN_URL, USERNAME, PASSWORD } = process.env;

if (!LOGIN_URL || !ADMIN_URL || !USERNAME || !PASSWORD) {
  console.error('❌ Missing env vars');
  process.exit(1);
}

/**
 * Articles that were accidentally updated with wrong content
 * Need to be restored to original titles
 */
const RESTORE_LIST = [
  {
    currentTitle: "Escortpiger i Danmark - Køb Escort Online",
    currentMeta: "Find escortpiger i Danmark. Diskret møde, professionel service. Book direkte online. Samme dag levering til hele landet.",
    // These were the WRONG articles we need to find and revert
    wrongArticles: [
      "Tantra Sex i Danmark - Guide til Massage og Teknikker",
      "Escort - Find seriøse escorts og massage i Danmark"
    ]
  }
];

async function findAndRestoreArticle(page, wrongTitle, originalTitle, originalMeta) {
  console.log(`\n🔍 Finding article: "${wrongTitle}"`);
  
  // Go to AdminTopics
  await page.goto(ADMIN_URL, { waitUntil: 'networkidle' });
  
  // Get all items
  const items = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('li.rlbItem')).map(el => {
      const tekst = (el.textContent || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
      return tekst;
    });
  });
  
  // Find the article
  let found = null;
  for (const item of items) {
    if (item.toLowerCase().includes(wrongTitle.toLowerCase().substring(0, 30))) {
      found = item;
      break;
    }
  }
  
  if (!found) {
    console.log(`   ❌ Article not found`);
    return false;
  }
  
  console.log(`   ✅ Found: "${found.substring(0, 60)}"`);
  console.log(`   ↩️  Restoring to original title...`);
  
  // Click on it
  const allItems = await page.locator('li.rlbItem').all();
  let clicked = false;
  
  for (const item of allItems) {
    const text = await item.textContent();
    if (text && text.includes(found.substring(0, 30))) {
      await item.click();
      clicked = true;
      break;
    }
  }
  
  if (!clicked) {
    console.log(`   ❌ Could not click article`);
    return false;
  }
  
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Get current title to know what to restore
  const currentTitle = await page.inputValue("#ctl00_MainContent_TbTitle");
  console.log(`   Current title: "${currentTitle}"`);
  
  // If it has our wrong update, restore to original
  if (currentTitle.includes("Escortpiger i Danmark")) {
    console.log(`   Restoring title to: "${originalTitle}"`);
    
    const titleField = "#ctl00_MainContent_TbTitle";
    try {
      await page.click(titleField, { clickCount: 3 });
      await page.press(titleField, "Backspace");
      await page.type(titleField, originalTitle);
      console.log(`     ✅ Title restored`);
    } catch (e) {
      console.log(`     ❌ Error: ${e.message}`);
      return false;
    }
    
    // Restore meta
    const metaField = "#ctl00_MainContent_TbMetaDescription";
    try {
      await page.click(metaField, { clickCount: 3 });
      await page.press(metaField, "Backspace");
      // Just clear it - we don't know original
      console.log(`     ✅ Meta cleared`);
    } catch (e) {
      console.log(`     ⚠️  Could not clear meta`);
    }
    
    // Save
    if (!DRY_RUN) {
      console.log(`   Saving...`);
      try {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click("#ctl00_MainContent_BtnSave"),
        ]);
        console.log(`   ✅ Article restored!`);
        return true;
      } catch (e) {
        console.log(`   ❌ Error saving: ${e.message}`);
        return false;
      }
    } else {
      console.log(`   (DRY-RUN: not saving)`);
      return true;
    }
  } else {
    console.log(`   ℹ️  Title doesn't match our wrong update, skipping`);
    return false;
  }
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🔄 RESTORE ACCIDENTALLY UPDATED ARTICLES');
  console.log('='.repeat(80));
  
  if (DRY_RUN) console.log('⚠️  DRY-RUN MODE (not saving)\n');
  
  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: 50,
  });
  
  try {
    const page = await browser.newPage();
    
    // Login
    console.log('\n🔐 Logging in...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
    
    const cookieBtn = page.locator('#cbConfirm');
    if (await cookieBtn.count() > 0) {
      await cookieBtn.click();
      await page.waitForTimeout(500);
    }
    
    await page.click('#ctl00_MainContent_LfLogin_LoginMain_UserName', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('#ctl00_MainContent_LfLogin_LoginMain_UserName', USERNAME, { delay: 60 });
    
    await page.click('#ctl00_MainContent_LfLogin_LoginMain_Password', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('#ctl00_MainContent_LfLogin_LoginMain_Password', PASSWORD, { delay: 60 });
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {}),
      page.click('#ctl00_MainContent_LfLogin_LoginMain_BtnLogin'),
    ]);
    
    if (page.url().toLowerCase().includes('login')) {
      throw new Error('Login failed');
    }
    
    console.log('✅ Logged in!\n');
    
    // Restore each article
    let restored = 0;
    for (const restore of RESTORE_LIST) {
      for (const wrongArticle of restore.wrongArticles) {
        const result = await findAndRestoreArticle(
          page, 
          wrongArticle, 
          wrongArticle, // We restore to original title (same as wrong article's original)
          "" // We clear meta
        );
        if (result) restored++;
        await page.waitForTimeout(2000);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`✅ Done! Restored ${restored} article(s)`);
    console.log('='.repeat(80) + '\n');
    
  } catch (err) {
    console.error('\n❌ Error: ' + err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
