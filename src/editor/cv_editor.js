import { fetchWithCSRF, CSRFProtection } from '../utils/csrf.js';
import { fetchWithRateLimit, debounce } from '../utils/rateLimiter.js';

let cvData = null;
let hasUnsavedChanges = false;
let templates = {};
let currentlySelectedCVId = null;
let currentCVLanguage = (chrome.i18n.getUILanguage() || 'en').split('-')[0];
let isLoadingTemplates = false;
let isLoadingCVs = false;
let isCreatingCV = false;
let isSavingCV = false;
let isDeletingCV = false;
let isRenamingCV = false;
let isDuplicatingCV = false;
let isLoadingCV = false;

// Modify the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', async function() {
  // Show loading state for the entire page
  document.body.classList.add('loading');
  
  try {
    await CSRFProtection.initialize();
    
    // Set the text content for all elements
    document.getElementById('skip-link').textContent = chrome.i18n.getMessage('skipToEditor');
    document.getElementById('cv-editor-title').textContent = chrome.i18n.getMessage('cvEditor');
    document.getElementById('scraped-profiles-title').textContent = chrome.i18n.getMessage('scrapedProfiles');
    document.getElementById('create-cv-btn').textContent = chrome.i18n.getMessage('createNewCV');
    document.getElementById('edit-cv-data-title').textContent = chrome.i18n.getMessage('editCVData');
    document.getElementById('save-changes-btn').textContent = chrome.i18n.getMessage('saveChanges');
    document.getElementById('preview-title').textContent = chrome.i18n.getMessage('preview');
    document.getElementById('select-template-label').textContent = chrome.i18n.getMessage('selectTemplate');
    document.getElementById('template1-option').textContent = chrome.i18n.getMessage('template1');
    document.getElementById('template2-option').textContent = chrome.i18n.getMessage('template2');
    document.getElementById('template3-option').textContent = chrome.i18n.getMessage('template3');
    document.getElementById('template4-option').textContent = chrome.i18n.getMessage('template4');
    document.getElementById('template5-option').textContent = chrome.i18n.getMessage('template5');
    document.getElementById('template6-option').textContent = chrome.i18n.getMessage('template6');
    document.getElementById('template7-option').textContent = chrome.i18n.getMessage('template7');
    document.getElementById('template8-option').textContent = chrome.i18n.getMessage('template8');
    document.getElementById('template9-option').textContent = chrome.i18n.getMessage('template9');
    document.getElementById('template10-option').textContent = chrome.i18n.getMessage('template10');
    document.getElementById('generate-pdf').textContent = chrome.i18n.getMessage('generatePDF');
    document.getElementById('save-html').textContent = chrome.i18n.getMessage('saveAsHTML');
    document.getElementById('open-preview').textContent = chrome.i18n.getMessage('openPreview');
    document.getElementById('create-cv-btn').addEventListener('click', debouncedCreateNewCV);
    document.getElementById('save-changes-btn').addEventListener('click', () => debouncedSaveChanges());

    await loadTemplates();
    await fetchUserCVs();
    
    // Add event listeners for CV list items
    document.getElementById('profile-select').addEventListener('click', debounce(function(e) {
      const cvItem = e.target.closest('.cv-item');
      if (cvItem && e.target.closest('.cv-info')) {
        e.preventDefault(); // Prevent any default action or bubbling
        const cvId = cvItem.querySelector('.delete-btn').dataset.cvId;
        loadSelectedCV(cvId);
      }
    }));

    // Set up CV language selector
    const cvLanguageSelect = document.getElementById('cv-language-select');
    cvLanguageSelect.value = currentCVLanguage;
    cvLanguageSelect.addEventListener('change', function() {
      currentCVLanguage = this.value;
      debouncedUpdatePreview();
    });

    document.getElementById('cv-language-label').textContent = chrome.i18n.getMessage('cvLanguage');
  } catch (error) {
    console.error('Error initializing editor:', error);
    alert(chrome.i18n.getMessage('errorInitializingEditor'));
  } finally {
    document.body.classList.remove('loading');
  }
});

// Add beforeunload event listener to warn about unsaved changes
window.addEventListener('beforeunload', function(e) {
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Add global error handler to catch unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
  // alert(`An unexpected error occurred: ${event.reason.message}`);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateCVList") {
    fetchUserCVs();
  }
});

async function fetchUserCVs() {
  if (isLoadingCVs) return;
  isLoadingCVs = true;
  
  const profileSelect = document.getElementById('profile-select');
  profileSelect.classList.add('loading');
  
  try {
    const result = await new Promise((resolve) => 
      chrome.storage.local.get(['user'], resolve)
    );
    
    if (!result.user) {
      throw new Error('No user found in storage');
    }
    
    const response = await fetchWithRateLimit(fetch, 
      `https://cvify.xyz/user-cvs?email=${encodeURIComponent(result.user)}`, 
      { credentials: 'include' }
    );
    
    const cvs = await response.json();
    await updateCVList(cvs);
    
  } catch (error) {
    console.error('Error fetching user CVs:', error);
    alert(chrome.i18n.getMessage('errorFetchingCVs'));
  } finally {
    isLoadingCVs = false;
    profileSelect.classList.remove('loading');
  }
}

function updateCVList(cvs) {
  const profileSelect = document.getElementById('profile-select');
  profileSelect.innerHTML = '';
  cvs.forEach(cv => {
    const cvItem = document.createElement('div');
    cvItem.className = 'cv-item';
    cvItem.setAttribute('role', 'listitem');
    cvItem.innerHTML = `
      <div class="cv-info">
        <div class="cv-name" aria-label="${chrome.i18n.getMessage('name')}">${cv.name}</div>
        <div class="cv-date" aria-label="${chrome.i18n.getMessage('date')}">${new Date(cv.created_at).toLocaleString()}</div>
      </div>
      <button class="rename-btn" data-cv-id="${cv.id}" aria-label="${chrome.i18n.getMessage('renameCV')}">${chrome.i18n.getMessage('renameCV')}</button>
      <button class="duplicate-btn" data-cv-id="${cv.id}" aria-label="${chrome.i18n.getMessage('duplicateCV')}">${chrome.i18n.getMessage('duplicateCV')}</button>
      <button class="delete-btn" data-cv-id="${cv.id}" aria-label="${chrome.i18n.getMessage('deleteCV')}">${chrome.i18n.getMessage('deleteCV')}</button>
    `;
    // cvItem.querySelector('.cv-info').addEventListener('click', () => loadSelectedCV(cv.id));
    cvItem.querySelector('.rename-btn').addEventListener('click', (e) => debouncedRenameCV(e, cv.id));
    cvItem.querySelector('.duplicate-btn').addEventListener('click', (e) => debouncedDuplicateCV(e, cv.id));
    cvItem.querySelector('.delete-btn').addEventListener('click', (e) => debouncedDeleteCV(e, cv.id));
    profileSelect.appendChild(cvItem);
  });
  
  // If there's a currently selected CV, make sure it's still highlighted
  if (currentlySelectedCVId) {
    const selectedItem = profileSelect.querySelector(`[data-cv-id="${currentlySelectedCVId}"]`);
    if (selectedItem) {
      selectedItem.classList.add('selected');
    }
  }
}

function deleteCV(event, cvId) {
  if (isDeletingCV) return;
  
  event.stopPropagation(); // Prevent triggering the loadSelectedCV function
  if (!confirm(chrome.i18n.getMessage('confirmDeleteCV'))) return;
  
  isDeletingCV = true;
  const deleteButton = event.target;
  const cvItem = deleteButton.closest('.cv-item');
  cvItem.classList.add('loading');
  deleteButton.classList.add('loading');
  
  fetchWithRateLimit(fetchWithCSRF, `https://cvify.xyz/cv/${cvId}/delete`, {
    method: 'DELETE',
    credentials: 'include'
  })
    .then(response => {
      if (response.ok) {
        if (currentlySelectedCVId == cvId) {
          deselectCV();
        }
        return fetchUserCVs(); // Refresh the CV list
      } else {
        throw new Error('Failed to delete CV');
      }
    })
    .catch(error => {
      console.error('Error:', error);
      alert(chrome.i18n.getMessage('errorDeleteCV'));
    })
    .finally(() => {
      isDeletingCV = false;
      cvItem.classList.remove('loading');
      deleteButton.classList.remove('loading');
    });
}

const debouncedDeleteCV = debounce(deleteCV);

function deselectCV() {
  console.log("deselectCV");
  currentlySelectedCVId = null;
  cvData = null;
  document.getElementById('editor-preview-container').style.display = 'none';
  document.getElementById('button-container').style.display = 'none';
  document.querySelector('.container').style.gridTemplateColumns = '1fr';
  document.getElementById('cv-data').innerHTML = '';
  document.getElementById('preview-content').innerHTML = '';
  // Return focus to the "Create New CV" button
  document.getElementById('create-cv-btn').focus();
}

function loadSelectedCV(cvId) {
  if (isLoadingCV) return;
  if (cvId == currentlySelectedCVId) return; // Prevent loading the same CV

  if (hasUnsavedChanges) {
    if (!confirm(chrome.i18n.getMessage('confirmDiscardChanges'))) {
      return;
    }
  }

  isLoadingCV = true;
  const cvDataEdit = document.getElementById('cv-data');
  const previewContent = document.getElementById('preview-content');
  cvDataEdit.classList.add('loading');
  previewContent.classList.add('loading');

  // Highlight selected CV in the list
  const cvItems = document.querySelectorAll('.cv-item');
  cvItems.forEach(item => {
    const deleteBtn = item.querySelector('.delete-btn');
    if (deleteBtn && deleteBtn.dataset.cvId == cvId) {
      item.classList.add('selected', 'loading');
    } else {
      item.classList.remove('selected');
    }
  });

  fetch(`https://cvify.xyz/cv/${cvId}`, {
    credentials: 'include'
  })
    .then(response => {
      if (!response.ok) throw new Error('Failed to load CV');
      return response.json();
    })
    .then(data => {
      currentlySelectedCVId = cvId;
      cvData = JSON.parse(JSON.stringify(data)); // Create a deep copy
      generateInputFields(cvData);
      updatePreview();
      document.getElementById('editor-preview-container').style.display = 'grid';
      document.getElementById('button-container').style.display = 'block';
      document.querySelector('.container').style.gridTemplateColumns = '30% 1fr';
      document.querySelector('.profile-list').style.width = '100%';
      updateSaveButton(false);
      
      // Set focus to the first input in the CV editor
      const firstInput = document.querySelector('#cv-data input, #cv-data textarea');
      if (firstInput) {
        firstInput.focus();
      }
    })
    .catch(error => {
      console.error('Error loading CV:', error);
      alert(chrome.i18n.getMessage('errorLoadingCV'));
      deselectCV();
    })
    .finally(() => {
      isLoadingCV = false;
      cvDataEdit.classList.remove('loading');
      previewContent.classList.remove('loading');
      // Remove loading state from CV items
      cvItems.forEach(item => item.classList.remove('loading'));
    });
}

const debouncedLoadSelectedCV = debounce(loadSelectedCV);
document.getElementById('profile-select').addEventListener('change', debouncedLoadSelectedCV);

function switchCV(cvId) {
  console.log("switchCV", cvId);
  currentlySelectedCVId = cvId;
  fetch(`https://cvify.xyz/cv/${cvId}`, {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(data => {
      cvData = JSON.parse(JSON.stringify(data)); // Create a deep copy
      generateInputFields(cvData);
      updatePreview();
      document.getElementById('editor-preview-container').style.display = 'grid';
      document.getElementById('button-container').style.display = 'block';
      document.querySelector('.container').style.gridTemplateColumns = '30% 1fr';
      document.querySelector('.profile-list').style.width = '100%';
      updateSaveButton(false);
      // Set focus to the first input in the CV editor
      const firstInput = document.querySelector('#cv-data input, #cv-data textarea');
      if (firstInput) {
        firstInput.focus();
      }
    });
}

async function loadTemplates() {
  if (isLoadingTemplates) return;
  isLoadingTemplates = true;
  
  const templateSelect = document.getElementById('template-select');
  templateSelect.disabled = true;
  
  try {
    const responses = await Promise.all([
      fetch(chrome.runtime.getURL('src/templates/template1.html')),
      fetch(chrome.runtime.getURL('src/templates/template2.html')),
      fetch(chrome.runtime.getURL('src/templates/template3.html')),
      fetch(chrome.runtime.getURL('src/templates/template4.html')),
      fetch(chrome.runtime.getURL('src/templates/template5.html')),
      fetch(chrome.runtime.getURL('src/templates/template6.html')),
      fetch(chrome.runtime.getURL('src/templates/template7.html')),
      fetch(chrome.runtime.getURL('src/templates/template8.html')),
      fetch(chrome.runtime.getURL('src/templates/template9.html')),
      fetch(chrome.runtime.getURL('src/templates/template10.html'))
    ]);
    
    const htmlContents = await Promise.all(responses.map(res => {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.text();
    }));
    
    templates = {
      template1: htmlContents[0],
      template2: htmlContents[1],
      template3: htmlContents[2],
      template4: htmlContents[3],
      template5: htmlContents[4],
      template6: htmlContents[5],
      template7: htmlContents[6],
      template8: htmlContents[7],
      template9: htmlContents[8],
      template10: htmlContents[9]
    };
  } catch (error) {
    console.error("Error loading templates:", error);
    alert(chrome.i18n.getMessage('errorLoadingTemplates'));
    throw error;
  } finally {
    isLoadingTemplates = false;
    templateSelect.disabled = false;
  }
}

function renderTemplate(templateString, data) {
  // Handle if statements
  templateString = templateString.replace(/\{%if\s+([\w.]+)%\}([\s\S]*?)\{%endif%\}/g,
    (match, condition, content) => {
      const keys = condition.split('.');
      let value = data;
      for (const key of keys) {
        value = value[key];
        if (value === undefined) break;
      }
      const conditionMet = value !== undefined && 
        (Array.isArray(value) ? value.length > 0 : 
         typeof value === 'object' ? Object.keys(value).length > 0 : 
         Boolean(value));
      return conditionMet ? renderTemplate(content, data) : '';
    }
  );

  // Handle for loops
  templateString = templateString.replace(/\{%for\s+(\w+)\s+in\s+(\w+)%\}([\s\S]*?)\{%endfor%\}/g, 
    (match, itemName, listName, content) => {
      const list = data[listName];
      return Array.isArray(list)
        ? list.map(item => renderTemplate(content, {...data, [itemName]: item})).join('')
        : '';
    }
  );

  // Handle simple variable substitution
  return templateString.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    const keys = key.split('.');
    let value = data;
    for (const k of keys) {
      value = value[k];
      if (value === undefined) break;
      if (k === 'profile_picture' && !value.startsWith('data:')) {
        value = `https://cvify.xyz/${value}`;
      }
    }
    return value !== undefined ? value : '';
  });
}

function reorderSections(renderedHtml, sectionOrder) {
  // Only reorder sections if there are sections to reorder
  if (sectionOrder && sectionOrder.length > 0) {
    // Find all conditional blocks in the template
    const conditionalBlocks = [];
    let match;
    const regex = /\{%if\s+([\w.]+)%\}([\s\S]*?)\{%endif%\}/g;
    while ((match = regex.exec(renderedHtml)) !== null) {
      // if exists sectionOrder, then push the block
      if (sectionOrder.includes(match[1].replace(/_/g, '-'))) {
        conditionalBlocks.push({
          fullMatch: match[0],
        field: match[1],
        content: match[2],
        index: match.index
        });
      }
    }

    // Create a deep copy of conditionalBlocks
    const reorderableBlocks = conditionalBlocks.map(block => ({...block}));

    // Sort the blocks according to sectionOrder
    reorderableBlocks.sort((a, b) => {
      const aIndex = sectionOrder.indexOf(a.field.replace(/_/g, '-'));
      const bIndex = sectionOrder.indexOf(b.field.replace(/_/g, '-'));
      return aIndex - bIndex;
    });

    // Replace blocks in reverse order to maintain indices
    for (let i = reorderableBlocks.length - 1; i >= 0; i--) {
      const currentBlock = reorderableBlocks[i];
      const targetBlock = conditionalBlocks[i];
      
      if (targetBlock) {
        renderedHtml = 
          renderedHtml.slice(0, targetBlock.index) +
          currentBlock.fullMatch +
          renderedHtml.slice(targetBlock.index + targetBlock.fullMatch.length);
      }
    }
  }
  return renderedHtml;
}

function updatePreview() {
  const previewContent = document.getElementById('preview-content');
  const templateName = document.getElementById('template-select').value;
  
  previewContent.classList.add('loading');
  
  try {
    // Clear existing shadow root if it exists
    if (previewContent.shadowRoot) {
      previewContent.shadowRoot.innerHTML = '';
    }
    
    // Create shadow root if it doesn't exist
    const shadowRoot = previewContent.shadowRoot || 
                      previewContent.attachShadow({ mode: 'open' });
    
    // Get the current order of sections
    const sections = Array.from(document.querySelectorAll('.cv-section'))
      .filter(section => !section.querySelector('.locked'));
    const sectionOrder = sections.map(section => section.id);
    
    if (!templates[templateName]) {
      throw new Error(`Template "${templateName}" not found`);
    }
    
    let renderedHtml = templates[templateName];
    cvData["localizations"] = cvLocalizations[currentCVLanguage];
    
    renderedHtml = reorderSections(renderedHtml, sectionOrder);
    renderedHtml = renderTemplate(renderedHtml, cvData);
    
    // Insert into shadow DOM
    shadowRoot.innerHTML = renderedHtml;
  } catch (error) {
    console.error("Error updating preview:", error);
  } finally {
    previewContent.classList.remove('loading');
  }
}

// Update the updateCVData function to handle array updates
const debouncedUpdatePreview = debounce(updatePreview);
document.getElementById('template-select').addEventListener('change', debouncedUpdatePreview);

// Add this function to parse template sections order
function parseTemplateOrder(templateHtml) {
  const sections = ['profile-picture', 'personal-info'];
  const foundSections = new Set();
  
  // Find all if blocks in template and extract section names
  const ifBlockRegex = /\{%if\s+([\w.]+)%\}([\s\S]*?)\{%endif%\}/g;
  let match;
  
  while ((match = ifBlockRegex.exec(templateHtml)) !== null) {
    const sectionName = match[1];
    
    // Map template section names to section IDs
    let sectionId;
    switch(sectionName) {
      case 'contact':
        sectionId = 'contact';
        break;
      case 'summary':
        sectionId = 'summary';
        break;
      case 'skills':
        sectionId = 'skills';
        break;
      case 'experience':
        sectionId = 'experience';
        break;
      case 'education':
        sectionId = 'education';
        break;
      case 'languages':
        sectionId = 'languages';
        break;
      case 'hourly_rate':
        sectionId = 'hourly-rate';
        break;
      case 'portfolio':
        sectionId = 'portfolio';
        break;
      case 'certifications':
        sectionId = 'certifications';
        break;
      case 'testimonials':
        sectionId = 'testimonials';
        break;
      default:
        continue;
    }
    
    if (!foundSections.has(sectionId)) {
      sections.push(sectionId);
      foundSections.add(sectionId);
    }
  }
  
  return sections;
}

function generateInputFields(data) {
  const container = document.getElementById('cv-data');
  container.innerHTML = '';

  // Get template name and parse its order
  const templateName = document.getElementById('template-select').value;
  const templateHtml = templates[templateName];
  const sectionOrder = parseTemplateOrder(templateHtml);

  // Check if the user is premium
  chrome.storage.local.get(['isPremium'], function(result) {
    const isPremium = result.isPremium || false;

    const sections = [
      { id: 'profile-picture', title: chrome.i18n.getMessage('profilePicture'), content: createProfilePictureSection, locked: true },
      { id: 'personal-info', title: chrome.i18n.getMessage('personalInformation'), content: createPersonalInfoSection, locked: true },
      { id: 'contact', title: chrome.i18n.getMessage('contactInformation'), content: createContactInfoSection },
      { id: 'summary', title: chrome.i18n.getMessage('summary'), content: createSummarySection },
      { id: 'skills', title: chrome.i18n.getMessage('skills'), content: createSkillsSection },
      { id: 'experience', title: chrome.i18n.getMessage('workExperience'), content: createWorkExperienceSection },
      { id: 'education', title: chrome.i18n.getMessage('education'), content: createEducationSection },
      { id: 'languages', title: chrome.i18n.getMessage('languages'), content: createLanguagesSection },
      { id: 'hourly-rate', title: chrome.i18n.getMessage('hourlyRate'), content: createHourlyRateSection },
      { id: 'portfolio', title: chrome.i18n.getMessage('portfolio'), content: createPortfolioSection },
      { id: 'certifications', title: chrome.i18n.getMessage('certifications'), content: createCertificationsSection },
      { id: 'testimonials', title: chrome.i18n.getMessage('testimonials'), content: createTestimonialsSection }
    ];

    // Sort sections according to template order
    const sortedSections = sectionOrder
      .map(id => sections.find(section => section.id === id))
      .filter(Boolean);

    if (isPremium) {
      const reorderMessage = document.createElement('p');
      reorderMessage.textContent = chrome.i18n.getMessage('reorderSections');
      reorderMessage.className = 'reorder-message';
      container.appendChild(reorderMessage);
    }

    sortedSections.forEach(section => {
      const sectionElement = document.createElement('div');
      sectionElement.id = section.id;
      sectionElement.className = 'cv-section';
      const titleElement = document.createElement('h3');
      titleElement.textContent = section.title;
      if (isPremium) {
        if (section.locked) {
          const lockIcon = document.createElement('span');
          lockIcon.textContent = ' 🔒';
          lockIcon.title = chrome.i18n.getMessage('sectionLocked');
          titleElement.appendChild(lockIcon);
        }
        else {
          sectionElement.draggable = true;
          sectionElement.addEventListener('dragstart', dragStart);
          sectionElement.addEventListener('dragover', dragOver);
          sectionElement.addEventListener('drop', drop);
        }
      }
      sectionElement.appendChild(titleElement);
      section.content(sectionElement, data);
      container.appendChild(sectionElement);
    });
  });
}

// Update the dragStart function to prevent dragging locked sections
function dragStart(e) {
  const section = e.target.closest('.cv-section');
  if (section.querySelector('.locked')) {
    e.preventDefault();
    return;
  }
  e.dataTransfer.setData('text/plain', section.id);
}

function dragOver(e) {
  e.preventDefault();
}

function drop(e) {
  e.preventDefault();
  const sourceId = e.dataTransfer.getData('text');
  const sourceElement = document.getElementById(sourceId);
  const targetElement = e.target.closest('.cv-section');
  
  if (sourceElement && targetElement && sourceElement !== targetElement) {
    // Don't allow dropping before locked sections
    const container = document.getElementById('cv-data');
    const sections = Array.from(container.querySelectorAll('.cv-section'));
    const targetIndex = sections.indexOf(targetElement);
    const lockedSections = sections.filter(section => section.querySelector('.locked'));
    const firstMovableIndex = sections.indexOf(lockedSections[lockedSections.length - 1]) + 1;
    
    if (targetIndex < firstMovableIndex) {
      return;
    }
    
    container.insertBefore(sourceElement, targetElement.nextSibling);
    updatePreview();
  }
}

// Helper functions to create each section
function createProfilePictureSection(container, data) {
  // Profile Picture
  const profilePicture = createFieldset(chrome.i18n.getMessage('profilePicture'));
  const img = document.createElement('img');
  img.id = 'profile-picture-img';
  img.alt = "Profile Picture";
  img.style.maxWidth = '200px';
  img.style.maxHeight = '200px';
  if (data.profile_picture) {
    // Check if profile picture is a data URL (from file upload) or remote URL
    img.src = data.profile_picture.startsWith('data:') ? 
      data.profile_picture : 
      `https://cvify.xyz/${data.profile_picture}`;
  }
  profilePicture.appendChild(img);
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.id = 'profile-picture-input';
  fileInput.setAttribute('aria-label', 'profile-picture');
  fileInput.addEventListener('change', debouncedUpdateProfilePicture);
  const fileLabel = document.createElement('label');
  fileLabel.htmlFor = 'profile-picture-input';
  fileLabel.textContent = chrome.i18n.getMessage('uploadProfilePicture');
  profilePicture.appendChild(fileLabel);
  profilePicture.appendChild(fileInput);
  container.appendChild(profilePicture);
}

function createPersonalInfoSection(container, data) {
  // Personal Information
  const personalInfo = createFieldset(chrome.i18n.getMessage('personalInformation'));
  personalInfo.appendChild(createInput(chrome.i18n.getMessage('name'), data.name, 'name'));
  personalInfo.appendChild(createInput(chrome.i18n.getMessage('title'), data.title, 'title'));
  container.appendChild(personalInfo);
}

function createContactInfoSection(container, data) {
  // Contact Information
  const contactInfo = createFieldset(chrome.i18n.getMessage('contactInformation'));
  contactInfo.appendChild(createInput(chrome.i18n.getMessage('email'), data.contact.email, 'contact.email'));
  contactInfo.appendChild(createInput(chrome.i18n.getMessage('phone'), data.contact.phone, 'contact.phone'));
  contactInfo.appendChild(createInput(chrome.i18n.getMessage('location'), data.contact.location, 'contact.location'));
  container.appendChild(contactInfo);
}

function createSummarySection(container, data) {
  // Summary
  const summary = createFieldset(chrome.i18n.getMessage('summary'));
  summary.appendChild(createTextarea(null, data.summary, 'summary'));
  container.appendChild(summary);
}

function createSkillsSection(container, data) {
  // Skills
  const skills = createFieldset(chrome.i18n.getMessage('skills'));
  skills.appendChild(createArrayInput(null, data.skills, 'skills'));
  container.appendChild(skills);
}

function createWorkExperienceSection(container, data) {
  // Work Experience
  const workExperience = createFieldset(chrome.i18n.getMessage('workExperience'));
  data.experience.forEach((job, index) => {
    const jobFieldset = createFieldset(`${chrome.i18n.getMessage('workExperience')} ${index + 1}`);
    jobFieldset.appendChild(createInput(chrome.i18n.getMessage('company'), job.company, `experience[${index}].company`));
    jobFieldset.appendChild(createInput(chrome.i18n.getMessage('jobTitle'), job.title, `experience[${index}].title`));
    jobFieldset.appendChild(createInput(chrome.i18n.getMessage('date'), job.date, `experience[${index}].date`));
    jobFieldset.appendChild(createTextarea(chrome.i18n.getMessage('description'), job.description, `experience[${index}].description`));
    workExperience.appendChild(jobFieldset);
  });
  container.appendChild(workExperience);
}

function createEducationSection(container, data) {
  // Education
  const education = createFieldset(chrome.i18n.getMessage('education'));
  data.education.forEach((edu, index) => {
    const eduFieldset = createFieldset(`${chrome.i18n.getMessage('education')} ${index + 1}`);
    eduFieldset.appendChild(createInput(chrome.i18n.getMessage('institution'), edu.institution, `education[${index}].institution`));
    eduFieldset.appendChild(createInput(chrome.i18n.getMessage('degree'), edu.degree, `education[${index}].degree`));
    eduFieldset.appendChild(createInput(chrome.i18n.getMessage('date'), edu.date, `education[${index}].date`));
    education.appendChild(eduFieldset);
  });
  container.appendChild(education);
}

function createLanguagesSection(container, data) {
  // Languages
  const languages = createFieldset(chrome.i18n.getMessage('languages'));
  languages.appendChild(createArrayInput(null, data.languages || [], 'languages'));
  container.appendChild(languages);
}

function createHourlyRateSection(container, data) {
  // Hourly Rate
  const hourlyRate = createFieldset(chrome.i18n.getMessage('hourlyRate'));
  hourlyRate.appendChild(createInput(null, data.hourly_rate || '', 'hourly_rate'));
  container.appendChild(hourlyRate);
}

function createPortfolioSection(container, data) {
  // Portfolio
  const portfolio = createFieldset(chrome.i18n.getMessage('portfolio'));
  portfolio.appendChild(createArrayInput(null, data.portfolio || [], 'portfolio'));
  container.appendChild(portfolio);
}

function createCertificationsSection(container, data) {
  // Certifications
  const certifications = createFieldset(chrome.i18n.getMessage('certifications'));
  certifications.appendChild(createInput(null, data.certifications || '', 'certifications'));
  container.appendChild(certifications);
}

function createTestimonialsSection(container, data) {
  // Testimonials
  const testimonials = createFieldset(chrome.i18n.getMessage('testimonials'));
  testimonials.appendChild(createArrayInput(null, data.testimonials || [], 'testimonials'));
  container.appendChild(testimonials);
}

function createFieldset(legend) {
  const fieldset = document.createElement('fieldset');
  const legendElement = document.createElement('legend');
  legendElement.textContent = legend;
  fieldset.appendChild(legendElement);
  return fieldset;
}

function createInput(label, value, key) {
  const div = document.createElement('div');
  const labelElement = document.createElement('label');
  if (label) {
    labelElement.textContent = label + ': ';
  }
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  input.id = key;
  input.name = key;
  input.dataset.key = key;
  input.setAttribute('aria-label', label);
  input.addEventListener('input', debouncedUpdateCVData);
  labelElement.htmlFor = key;
  div.appendChild(labelElement);
  div.appendChild(input);
  return div;
}

function createTextarea(label, value, key) {
  const div = document.createElement('div');
  const labelElement = document.createElement('label');
  if (label) {
    labelElement.textContent = label + ': ';
  }
  const textarea = document.createElement('textarea');
  textarea.value = value || '';
  textarea.id = key;
  textarea.name = key;
  textarea.dataset.key = key;
  textarea.setAttribute('aria-label', label);
  textarea.addEventListener('input', debouncedUpdateCVData);
  labelElement.htmlFor = key;
  div.appendChild(labelElement);
  div.appendChild(textarea);
  return div;
}

function createArrayInput(label, values, key) {
  const div = document.createElement('div');
  const labelElement = document.createElement('label');
  if (label) {
    labelElement.textContent = label + ': ';
  }
  div.appendChild(labelElement);

  const arrayContainer = document.createElement('div');
  arrayContainer.className = 'array-container';
  div.appendChild(arrayContainer);

  values.forEach((value, index) => {
    const inputGroup = createArrayInputGroup(key, index, value);
    arrayContainer.appendChild(inputGroup);
  });

  const addButton = document.createElement('button');
  addButton.textContent = '+';
  addButton.className = 'array-add-btn';
  addButton.setAttribute('aria-label', chrome.i18n.getMessage('addItem'));
  addButton.addEventListener('click', () => debouncedAddArrayItem(arrayContainer, key, ''));
  div.appendChild(addButton);

  return div;
}

function createArrayInputGroup(key, index, value) {
  const inputGroup = document.createElement('div');
  inputGroup.className = 'array-input-group';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.dataset.key = `${key}[${index}]`;
  input.addEventListener('input', debouncedUpdateCVData);

  const removeButton = document.createElement('button');
  removeButton.textContent = '-';
  removeButton.className = 'array-remove-btn';
  removeButton.setAttribute('aria-label', chrome.i18n.getMessage('removeItem'));
  removeButton.addEventListener('click', () => debouncedRemoveArrayItem(inputGroup, key));

  inputGroup.appendChild(input);
  inputGroup.appendChild(removeButton);

  return inputGroup;
}

function addArrayItem(container, key, value) {
  const index = container.children.length;
  const inputGroup = createArrayInputGroup(key, index, value);
  container.appendChild(inputGroup);
  updateCVData({ target: inputGroup.querySelector('input') });
}

const debouncedAddArrayItem = debounce(addArrayItem);

function removeArrayItem(inputGroup, key) {
  const container = inputGroup.parentElement;
  container.removeChild(inputGroup);
  updateArrayIndices(container, key);
  Array.from(container.querySelectorAll('input')).forEach(input => {
    updateCVData({ target: input }, false);
  });
  // Call updateCVData for the removed element with null value
  const lastInput = container.lastElementChild ? container.lastElementChild.querySelector('input') : null;
  if (lastInput) {
    const lastKey = lastInput.dataset.key;
    const keyParts = lastKey.split('[');
    const index = parseInt(keyParts[1]) + 1;
    const newLastKey = `${keyParts[0]}[${index}]`;
    updateCVData({ target: { dataset: { key: newLastKey }, value: null } }, false);
  } else {
    const keyParts = key.split('[');
    const index = 0;
    const newLastKey = `${keyParts[0]}[${index}]`;
    updateCVData({ target: { dataset: { key: newLastKey }, value: null } }, false);
  }
  updatePreview();
}

const debouncedRemoveArrayItem = debounce(removeArrayItem);

function updateArrayIndices(container, key) {
  Array.from(container.children).forEach((inputGroup, index) => {
    const input = inputGroup.querySelector('input');
    input.dataset.key = `${key}[${index}]`;
  });
}

function updateCVData(event, callUpdatePreview = true) {
  const key = event.target.dataset.key;
  const value = event.target.value;
  const keys = key.split('.');
  let data = cvData;

  // Handle nested objects and arrays
  for (let i = 0; i < keys.length - 1; i++) {
    const arrayMatch = keys[i].match(/(\w+)\[(\d+)\]/);
    if (arrayMatch) {
      const arrayKey = arrayMatch[1];
      const arrayIndex = parseInt(arrayMatch[2]);
      if (!data[arrayKey]) data[arrayKey] = [];
      if (typeof data[arrayKey][arrayIndex] !== 'object') data[arrayKey][arrayIndex] = {};
      data = data[arrayKey][arrayIndex];
    } else {
      if (!data[keys[i]]) data[keys[i]] = {};
      data = data[keys[i]];
    }
  }

  // Set the value
  const lastKey = keys[keys.length - 1];
  const arrayMatch = lastKey.match(/(\w+)\[(\d+)\]/);
  if (arrayMatch) {
    const arrayKey = arrayMatch[1];
    const arrayIndex = parseInt(arrayMatch[2]);
    if (!Array.isArray(data[arrayKey])) data[arrayKey] = [];
    data[arrayKey][arrayIndex] = value;
    // Remove null elements from the end of the array
    while (data[arrayKey].length > 0 && (data[arrayKey][data[arrayKey].length - 1] === null || data[arrayKey][data[arrayKey].length - 1] === undefined)) {
      data[arrayKey].pop();
    }
  } else {
    data[lastKey] = value;
  }

  updateSaveButton(true);

  // Always update the preview, except for profile picture changes
  if (callUpdatePreview && key !== 'profile_picture') {
    updatePreview();
  }
}

const debouncedUpdateCVData = debounce(updateCVData);

function updateProfilePicture(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      cvData.profile_picture = e.target.result;
      const img = document.getElementById('profile-picture-img');
      img.src = e.target.result;
      updateSaveButton(true);
      updatePreview();
    };
    reader.readAsDataURL(file);
  }
}

const debouncedUpdateProfilePicture = debounce(updateProfilePicture);

function createPrintWindow() {
  const previewContent = document.getElementById('preview-content').shadowRoot.innerHTML;
  const printWindow = window.open('', '', 'height=600,width=800');
  printWindow.document.write('<html><head><title>CV Preview</title>');
  printWindow.document.write('<style>');
  printWindow.document.write(`
    @media print {
      @page { margin: 0; }
      body { margin: 1.6cm; }
      @page :first { margin-top: 0; }
    }
  `);
  printWindow.document.write('</style>');
  printWindow.document.write('</head><body>');
  printWindow.document.write(previewContent);
  printWindow.document.write('</body></html>');
  printWindow.document.close();
  return printWindow;
}

function generatePDF() {
  const printWindow = createPrintWindow();
  printWindow.onload = function() {
    printWindow.focus();
    printWindow.print();
    printWindow.onafterprint = function() {
      printWindow.close();
    };
  };
}

const debouncedGeneratePDF = debounce(generatePDF);
document.getElementById('generate-pdf').addEventListener('click', debouncedGeneratePDF);

function saveAsHTML() {
  const previewContent = document.getElementById('preview-content').innerHTML;
  const blob = new Blob([previewContent], {type: 'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cv.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const debouncedSaveAsHTML = debounce(saveAsHTML);
document.getElementById('save-html').addEventListener('click', debouncedSaveAsHTML);

function openPreview() {
  createPrintWindow();
}

const debouncedOpenPreview = debounce(openPreview);
document.getElementById('open-preview').addEventListener('click', debouncedOpenPreview);

async function createNewCV() {
  if (isCreatingCV) return;
  
  if (hasUnsavedChanges && !confirm(chrome.i18n.getMessage('confirmDiscardChanges'))) {
    return;
  }
  
  const createButton = document.getElementById('create-cv-btn');
  isCreatingCV = true;
  createButton.classList.add('loading');
  
  try {
    const blankCV = {
      name: '',
      title: '',
      contact: { email: '', phone: '', location: '' },
      summary: '',
      skills: [],
      experience: [{ company: '', title: '', date: '', description: '' }],
      education: [{ institution: '', degree: '', date: '' }],
      languages: [],
      hourly_rate: '',
      portfolio: [],
      certifications: '',
      testimonials: []
    };

    const response = await fetchWithRateLimit(fetchWithCSRF, 'https://cvify.xyz/create-cv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(blankCV),
      credentials: 'include'
    });

    const data = await response.json();
    await fetchUserCVs();
    await loadSelectedCV(data.id);
    
  } catch (error) {
    console.error('Error:', error);
    alert(chrome.i18n.getMessage('errorCreateCV'));
  } finally {
    isCreatingCV = false;
    createButton.classList.remove('loading');
  }
}

const debouncedCreateNewCV = debounce(createNewCV);

async function saveChanges() {
  if (isSavingCV) return;
  
  const saveButton = document.getElementById('save-changes-btn');
  isSavingCV = true;
  saveButton.classList.add('loading');
  
  try {
    const response = await fetchWithRateLimit(fetchWithCSRF, 
      `https://cvify.xyz/cv/${currentlySelectedCVId}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cvData),
        credentials: 'include'
      }
    );

    if (!response.ok) throw new Error('Failed to save changes');
    
    alert(chrome.i18n.getMessage('successSaveChanges'));
    hasUnsavedChanges = false;
    updateSaveButton(false);
    await updatePreview();
    
  } catch (error) {
    console.error("Error saving changes:", error);
    alert(chrome.i18n.getMessage('errorSaveChanges'));
  } finally {
    isSavingCV = false;
    saveButton.classList.remove('loading');
  }
}

const debouncedSaveChanges = debounce(saveChanges);

function updateSaveButton(state=null) {
  if (state === false || state === true) {
    hasUnsavedChanges = state;
  }
  const saveButton = document.getElementById('save-changes-btn');
  saveButton.disabled = !hasUnsavedChanges;
}

document.getElementById('profile-select').addEventListener('keydown', debounce(function(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    const cvItem = e.target.closest('.cv-item');
    if (cvItem && e.target.closest('.cv-info')) {
      e.preventDefault();
      const cvId = cvItem.querySelector('.delete-btn').dataset.cvId;
      loadSelectedCV(cvId);
    }
  }
}));

function renameCV(event, cvId) {
  if (isRenamingCV) return;
  
  event.stopPropagation();
  const newName = prompt(chrome.i18n.getMessage('enterNewName'));
  if (!newName) return;
  
  isRenamingCV = true;
  const renameButton = event.target;
  const cvItem = renameButton.closest('.cv-item');
  cvItem.classList.add('loading');
  renameButton.classList.add('loading');
  
  fetchWithRateLimit(fetchWithCSRF, `https://cvify.xyz/cv/${cvId}/rename`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newName }),
    credentials: 'include'
  })
    .then(response => {
      if (response.ok) {
        return fetchUserCVs();
      } else {
        throw new Error('Failed to rename CV');
      }
    })
    .catch(error => {
      console.error('Error:', error);
      alert(chrome.i18n.getMessage('errorRenameCV'));
    })
    .finally(() => {
      isRenamingCV = false;
      cvItem.classList.remove('loading');
      renameButton.classList.remove('loading');
    });
}

const debouncedRenameCV = debounce(renameCV);

function duplicateCV(event, cvId) {
  if (isDuplicatingCV) return;
  
  event.stopPropagation();
  isDuplicatingCV = true;
  const duplicateButton = event.target;
  const cvItem = duplicateButton.closest('.cv-item');
  cvItem.classList.add('loading');
  duplicateButton.classList.add('loading');
  
  fetchWithRateLimit(fetchWithCSRF, `https://cvify.xyz/cv/${cvId}/duplicate`, {
    method: 'POST',
    credentials: 'include'
  })
    .then(response => {
      if (response.ok) {
        return fetchUserCVs();
      } else {
        throw new Error('Failed to duplicate CV');
      }
    })
    .catch(error => {
      console.error('Error:', error);
      alert(chrome.i18n.getMessage('errorDuplicateCV'));
    })
    .finally(() => {
      isDuplicatingCV = false;
      cvItem.classList.remove('loading');
      duplicateButton.classList.remove('loading');
    });
}

const debouncedDuplicateCV = debounce(duplicateCV);

// Add some CSS for the new buttons
const style = document.createElement('style');
style.textContent = `
  .array-input-group {
    display: flex;
    margin-bottom: 5px;
  }
  .array-input-group input {
    flex-grow: 1;
    margin-right: 5px;
  }
  .array-add-btn, .array-remove-btn {
    background-color: #4CAF50;
    color: white;
    border: none;
    padding: 5px 10px;
    text-align: center;
    text-decoration: none;
    display: inline-block;
    font-size: 16px;
    margin: 2px 2px;
    cursor: pointer;
  }
  .array-remove-btn {
    background-color: #f44336;
  }
  .cv-section {
    border: 1px solid #ddd;
    padding: 10px;
    margin-bottom: 10px;
    background-color: #f9f9f9;
  }
  .cv-section:hover {
    background-color: #f0f0f0;
  }
  .reorder-message {
    font-style: italic;
    color: #666;
    margin-bottom: 10px;
  }
  .cv-section {
    border: 1px solid #ddd;
    padding: 10px;
    margin-bottom: 10px;
    background-color: #f9f9f9;
    transition: background-color 0.3s;
  }
  .cv-section:not(.locked):hover {
    background-color: #f0f0f0;
    cursor: grab;
  }
  .cv-section .locked {
    color: #666;
    font-size: 0.8em;
    margin-left: 5px;
  }
  .reorder-message {
    font-style: italic;
    color: #666;
    margin-bottom: 10px;
    padding: 10px;
    background-color: #fff3cd;
    border: 1px solid #ffeeba;
    border-radius: 4px;
  }
  .cv-section h3 {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cv-item {
    position: relative;
    transition: opacity 0.3s;
  }
  
  .cv-item.loading {
    opacity: 0.7;
    pointer-events: none;
  }
  
  .cv-item.loading::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    margin: -10px 0 0 -10px;
    border: 3px solid #f3f3f3;
    border-top: 3px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  .cv-item.selected {
    background-color: #e3f2fd;
  }
  
  #cv-data.loading,
  #preview-content.loading {
    min-height: 200px;
  }
  
  button.loading {
    position: relative;
    color: transparent !important;
  }
  
  button.loading::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 16px;
    height: 16px;
    margin: -8px 0 0 -8px;
    border: 2px solid #f3f3f3;
    border-top: 2px solid #ffffff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
`;
document.head.appendChild(style);
