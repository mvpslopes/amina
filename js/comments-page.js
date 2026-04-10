/**
 * ÂMINA - Comments Page (Dedicated Page)
 * Página dedicada de avaliações com paginação
 */

(function() {
  'use strict';

  const API_BASE = window.AMINA_CONFIG?.apiUrl || '/api/';
  const COMMENTS_PER_PAGE = 8;

  // Estado
  let currentOffset = 0;
  let totalComments = 0;
  let isLoading = false;

  // Elementos DOM
  const elements = {
    commentsList: document.getElementById('commentsPageList'),
    commentsLoading: document.getElementById('commentsPageLoading'),
    loadMoreContainer: document.getElementById('loadMoreContainer'),
    loadMoreBtn: document.getElementById('loadMoreBtn'),
    commentForm: document.getElementById('commentPageForm'),
    commentSubmit: document.getElementById('commentPageSubmit'),
    commentSuccess: document.getElementById('commentPageSuccess'),
    commentError: document.getElementById('commentPageError'),
    commentErrorText: document.getElementById('commentPageErrorText'),
    starRating: document.getElementById('starRatingPage'),
    ratingInput: document.getElementById('ratingPageInput'),
    commentPhoto: document.getElementById('commentPagePhoto'),
    fileText: document.getElementById('filePageText'),
    filePreview: document.getElementById('filePagePreview'),
  };

  // Inicialização
  function init() {
    if (!elements.commentsList) return;
    
    loadComments(true);
    initStarRating();
    initFileUpload();
    initForm();
    initLoadMore();
  }

  // Carrega comentários
  async function loadComments(isInitial = false) {
    if (isLoading) return;
    isLoading = true;

    if (isInitial) {
      currentOffset = 0;
      // Limpa lista exceto loading
      const cards = elements.commentsList?.querySelectorAll('.comment-card');
      cards?.forEach(card => card.remove());
    }

    try {
      const response = await fetch(
        `${API_BASE}public_comments.php?limit=${COMMENTS_PER_PAGE}&offset=${currentOffset}`
      );
      const data = await response.json();

      if (data.ok && data.comments) {
        totalComments = data.total;
        renderComments(data.comments, isInitial);
        updateLoadMoreButton();
      } else {
        showCommentsError();
      }
    } catch (error) {
      console.error('Erro ao carregar comentários:', error);
      showCommentsError();
    } finally {
      isLoading = false;
      if (elements.commentsLoading) {
        elements.commentsLoading.style.display = 'none';
      }
    }
  }

  // Renderiza lista de comentários
  function renderComments(comments, isInitial) {
    if (comments.length === 0 && isInitial) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'comment-card';
      emptyMsg.innerHTML = '<p style="text-align:center;color:var(--gray);">Ainda não temos avaliações. Seja a primeira!</p>';
      elements.commentsList?.appendChild(emptyMsg);
      return;
    }

    comments.forEach(comment => {
      const card = createCommentCard(comment);
      elements.commentsList?.appendChild(card);
    });
  }

  // Cria card de comentário
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

  // Mostra erro ao carregar comentários
  function showCommentsError() {
    if (elements.commentsLoading) {
      elements.commentsLoading.style.display = 'none';
    }
    const errorMsg = document.createElement('div');
    errorMsg.className = 'comment-card';
    errorMsg.innerHTML = '<p style="text-align:center;color:var(--wine);">Erro ao carregar avaliações. <button onclick="location.reload()" style="background:none;border:none;color:var(--wine);text-decoration:underline;cursor:pointer;">Tentar novamente</button></p>';
    elements.commentsList?.appendChild(errorMsg);
  }

  // Atualiza botão "Carregar mais"
  function updateLoadMoreButton() {
    const loadedCount = elements.commentsList?.querySelectorAll('.comment-card').length || 0;
    const hasMore = loadedCount < totalComments;
    
    if (elements.loadMoreContainer) {
      elements.loadMoreContainer.hidden = !hasMore;
    }
  }

  // Inicializa botão "Carregar mais"
  function initLoadMore() {
    if (!elements.loadMoreBtn) return;

    elements.loadMoreBtn.addEventListener('click', async () => {
      const loadedCount = elements.commentsList?.querySelectorAll('.comment-card').length || 0;
      currentOffset = loadedCount;
      
      elements.loadMoreBtn.disabled = true;
      elements.loadMoreBtn.innerHTML = '<div class="comments-form__spinner" style="width:16px;height:16px;border-width:2px;"></div><span>Carregando...</span>';
      
      await loadComments(false);
      
      elements.loadMoreBtn.disabled = false;
      elements.loadMoreBtn.innerHTML = '<span>Carregar mais</span><i class="fa-solid fa-chevron-down"></i>';
    });
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
