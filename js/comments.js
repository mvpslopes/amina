/**
 * ÂMINA - Comments System
 * Sistema de comentários e avaliações com moderação
 */

(function() {
  'use strict';

  const API_BASE = window.AMINA_CONFIG?.apiUrl || '/api/';

  // Elementos DOM
  const elements = {
    // Top 3 comments section (testimonials style)
    topCommentsGrid: document.getElementById('topCommentsGrid'),
    
    // Comments list section (form + more comments)
    commentsList: document.getElementById('commentsList'),
    commentsLoading: document.getElementById('commentsLoading'),
    commentsCount: document.getElementById('commentsCount'),
    
    // Form elements
    commentForm: document.getElementById('commentForm'),
    commentSubmit: document.getElementById('commentSubmit'),
    commentSuccess: document.getElementById('commentSuccess'),
    commentError: document.getElementById('commentError'),
    commentErrorText: document.getElementById('commentErrorText'),
    starRating: document.getElementById('starRating'),
    ratingInput: document.getElementById('ratingInput'),
    commentPhoto: document.getElementById('commentPhoto'),
    fileText: document.getElementById('fileText'),
    filePreview: document.getElementById('filePreview'),
  };

  // Inicialização
  function init() {
    // Carrega top 3 na seção de depoimentos
    if (elements.topCommentsGrid) {
      loadTopComments();
    }
    
    // Carrega demais comentários na seção com formulário
    if (elements.commentsList) {
      loadMoreComments();
      initStarRating();
      initFileUpload();
      initForm();
    }
  }

  // Carrega os 3 comentários mais recentes (para seção de depoimentos)
  async function loadTopComments() {
    try {
      const response = await fetch(`${API_BASE}public_comments.php?limit=3&offset=0`);
      const data = await response.json();

      if (data.ok && data.comments) {
        renderTopComments(data.comments);
      } else {
        showTopCommentsEmpty();
      }
    } catch (error) {
      console.error('Erro ao carregar top comentários:', error);
      showTopCommentsEmpty();
    }
  }

  // Renderiza os 3 comentários no estilo testimonials
  function renderTopComments(comments) {
    if (!elements.topCommentsGrid) return;

    elements.topCommentsGrid.innerHTML = '';

    if (comments.length === 0) {
      elements.topCommentsGrid.innerHTML = `
        <div class="testimonial-card" style="grid-column: 1 / -1; text-align: center;">
          <p style="color: var(--gray);">Seja a primeira a avaliar! Deixe sua opinião na seção abaixo.</p>
        </div>
      `;
      return;
    }

    comments.forEach(comment => {
      const card = createTestimonialCard(comment);
      elements.topCommentsGrid.appendChild(card);
    });
  }

  // Cria card no estilo testimonial
  function createTestimonialCard(comment) {
    const card = document.createElement('div');
    card.className = 'testimonial-card';

    const stars = Array(5).fill(0).map((_, i) => 
      `<i class="fa-${i < comment.rating ? 'solid' : 'regular'} fa-star" style="${i >= comment.rating ? 'color:var(--cream-dark)' : ''}"></i>`
    ).join('');

    const avatarGradient = getAvatarGradient(comment.author_name);
    const avatar = comment.author_photo 
      ? `<div class="testimonial-card__avatar" style="background: url('${escapeHtml(comment.author_photo)}') center/cover no-repeat;"></div>`
      : `<div class="testimonial-card__avatar" style="background: ${avatarGradient}; display:flex; align-items:center; justify-content:center; color:#fff; font-size:1.2rem; font-weight:600;">${escapeHtml(comment.author_name.charAt(0).toUpperCase())}</div>`;

    card.innerHTML = `
      <div class="testimonial-card__stars">${stars}</div>
      <p>"${escapeHtml(comment.body)}"</p>
      <div class="testimonial-card__author">
        ${avatar}
        <div>
          <strong>${escapeHtml(comment.author_name)}</strong>
          <span>Cliente ÂMINA</span>
        </div>
      </div>
    `;

    return card;
  }

  function getAvatarGradient(name) {
    const gradients = [
      'linear-gradient(135deg, var(--wine) 0%, #8a3050 100%)',
      'linear-gradient(135deg, var(--gold) 0%, #a87d40 100%)',
      'linear-gradient(135deg, #1c1c2e 0%, #4a4a8e 100%)',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length];
  }

  function showTopCommentsEmpty() {
    if (!elements.topCommentsGrid) return;
    elements.topCommentsGrid.innerHTML = `
      <div class="testimonial-card" style="grid-column: 1 / -1; text-align: center;">
        <p style="color: var(--gray);">Erro ao carregar avaliações.</p>
      </div>
    `;
  }

  // Carrega os demais comentários (a partir do 4º) para a seção com formulário
  async function loadMoreComments() {
    try {
      const response = await fetch(`${API_BASE}public_comments.php?limit=10&offset=3`);
      const data = await response.json();

      if (data.ok && data.comments) {
        renderMoreComments(data.comments, Math.max(0, data.total - 3));
      } else {
        showMoreCommentsEmpty();
      }
    } catch (error) {
      console.error('Erro ao carregar mais comentários:', error);
      showMoreCommentsEmpty();
    }
  }

  // Renderiza comentários adicionais na seção ao lado do formulário
  function renderMoreComments(comments, totalRemaining) {
    if (elements.commentsLoading) {
      elements.commentsLoading.style.display = 'none';
    }

    if (elements.commentsCount) {
      if (totalRemaining > 0) {
        elements.commentsCount.textContent = `+${totalRemaining} avaliação${totalRemaining !== 1 ? 'es' : ''}`;
      } else {
        elements.commentsCount.textContent = 'Ver todas';
      }
    }

    const existingCards = elements.commentsList?.querySelectorAll('.comment-card');
    existingCards?.forEach(card => card.remove());

    if (comments.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'comment-card';
      emptyMsg.innerHTML = '<p style="text-align:center;color:var(--gray);">Nenhuma avaliação adicional.</p>';
      elements.commentsList?.appendChild(emptyMsg);
      return;
    }

    comments.forEach(comment => {
      const card = createCommentCard(comment);
      elements.commentsList?.appendChild(card);
    });
  }

  // Cria card de comentário (estilo mais compacto)
  function createCommentCard(comment) {
    const card = document.createElement('div');
    card.className = 'comment-card';

    const date = new Date(comment.created_at);
    const dateStr = date.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const stars = Array(5).fill(0).map((_, i) => 
      `<i class="fa-${i < comment.rating ? 'solid' : 'regular'} fa-star" style="${i >= comment.rating ? 'color:var(--cream-dark)' : ''}"></i>`
    ).join('');

    const avatar = comment.author_photo 
      ? `<img src="${escapeHtml(comment.author_photo)}" alt="" class="comment-card__avatar">`
      : `<div class="comment-card__avatar comment-card__avatar--default">${escapeHtml(comment.author_name.charAt(0).toUpperCase())}</div>`;

    card.innerHTML = `
      <div class="comment-card__header">
        ${avatar}
        <div class="comment-card__meta">
          <span class="comment-card__name">${escapeHtml(comment.author_name)}</span>
          <span class="comment-card__date">${dateStr}</span>
        </div>
        <div class="comment-card__stars">${stars}</div>
      </div>
      <div class="comment-card__body">
        <p>${escapeHtml(comment.body)}</p>
      </div>
    `;

    return card;
  }

  function showMoreCommentsEmpty() {
    if (elements.commentsLoading) {
      elements.commentsLoading.style.display = 'none';
    }
    if (elements.commentsCount) {
      elements.commentsCount.textContent = 'Erro ao carregar';
    }
  }

  // Inicializa sistema de estrelas
  function initStarRating() {
    if (!elements.starRating) return;

    const stars = elements.starRating.querySelectorAll('.comments-form__star');
    let currentRating = 5;

    function updateStars(rating) {
      stars.forEach((star, index) => {
        if (index < rating) {
          star.classList.add('active');
          star.style.color = 'var(--gold)';
        } else {
          star.classList.remove('active');
          star.style.color = 'var(--cream-dark)';
        }
      });
    }

    stars.forEach((star, index) => {
      star.addEventListener('mouseenter', () => updateStars(index + 1));
      
      star.addEventListener('click', () => {
        currentRating = index + 1;
        if (elements.ratingInput) {
          elements.ratingInput.value = currentRating;
        }
        updateStars(currentRating);
      });
    });

    elements.starRating.addEventListener('mouseleave', () => updateStars(currentRating));
    updateStars(currentRating);
  }

  // Inicializa upload de arquivo
  function initFileUpload() {
    if (!elements.commentPhoto) return;

    elements.commentPhoto.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) {
        resetFilePreview();
        return;
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      const maxSize = 2 * 1024 * 1024;

      if (!allowedTypes.includes(file.type)) {
        showFormError('Use apenas JPG, PNG ou WebP');
        resetFilePreview();
        return;
      }

      if (file.size > maxSize) {
        showFormError('Foto muito grande (máx. 2 MB)');
        resetFilePreview();
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        if (elements.filePreview) {
          elements.filePreview.src = e.target.result;
          elements.filePreview.hidden = false;
        }
        if (elements.fileText) {
          elements.fileText.textContent = file.name;
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function resetFilePreview() {
    if (elements.filePreview) {
      elements.filePreview.src = '';
      elements.filePreview.hidden = true;
    }
    if (elements.fileText) {
      elements.fileText.textContent = 'Clique para adicionar foto';
    }
    if (elements.commentPhoto) {
      elements.commentPhoto.value = '';
    }
  }

  // Inicializa formulário
  function initForm() {
    if (!elements.commentForm) return;

    elements.commentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      hideMessages();
      setSubmitting(true);

      try {
        const formData = new FormData(elements.commentForm);

        const response = await fetch(`${API_BASE}comment_submit.php`, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (data.ok) {
          showFormSuccess(data.message);
          elements.commentForm.reset();
          resetFilePreview();
          resetRating();
          // Recarrega os comentários após envio
          loadTopComments();
          loadMoreComments();
        } else {
          showFormError(data.error || 'Erro ao enviar avaliação');
        }
      } catch (error) {
        console.error('Erro ao enviar:', error);
        showFormError('Não foi possível enviar. Tente novamente.');
      } finally {
        setSubmitting(false);
      }
    });
  }

  function setSubmitting(isSubmitting) {
    if (!elements.commentSubmit) return;
    
    elements.commentSubmit.disabled = isSubmitting;
    
    if (isSubmitting) {
      elements.commentSubmit.innerHTML = `
        <div class="comments-form__spinner"></div>
        <span>Enviando...</span>
      `;
    } else {
      elements.commentSubmit.innerHTML = `
        <span>Enviar Avaliação</span>
        <i class="fa-solid fa-paper-plane"></i>
      `;
    }
  }

  function resetRating() {
    if (elements.ratingInput) {
      elements.ratingInput.value = '5';
    }
    const stars = elements.starRating?.querySelectorAll('.comments-form__star');
    stars?.forEach((star, index) => {
      if (index < 5) {
        star.classList.add('active');
        star.style.color = 'var(--gold)';
      }
    });
  }

  function showFormSuccess(message) {
    if (elements.commentSuccess) {
      elements.commentSuccess.querySelector('span').textContent = message;
      elements.commentSuccess.hidden = false;
    }
    setTimeout(() => {
      if (elements.commentSuccess) {
        elements.commentSuccess.hidden = true;
      }
    }, 5000);
  }

  function showFormError(message) {
    if (elements.commentError) {
      elements.commentErrorText.textContent = message;
      elements.commentError.hidden = false;
    }
  }

  function hideMessages() {
    if (elements.commentSuccess) elements.commentSuccess.hidden = true;
    if (elements.commentError) elements.commentError.hidden = true;
  }

  // Utilitários
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Inicializa quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

