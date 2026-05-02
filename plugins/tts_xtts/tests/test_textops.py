from app.textops import consolidate_single_word_sentences

def test_greedy_merge_forward():
    text = "Wait. No. Stop. Go."
    # 1+1+1+1 = 4 words. All should merge into one line.
    expected = "Wait; No; Stop; Go."
    assert consolidate_single_word_sentences(text) == expected

def test_paragraph_preservation_with_merge():
    # Even if they merge, we want to know it's one block now
    text = "Effie.\nFine, fine.\nShe threw her hands up."
    result = consolidate_single_word_sentences(text)
    # The new logic updates line_idx as it merges, so "Effie" and "Fine, fine" 
    # are absorbed into the line of the latest sentence that made it "safe".
    assert "Effie; Fine, fine; She threw her hands up." in result

def test_short_merge_limit():
    text = "Hello. This is a very long sentence that is safe."
    # "Hello" (1) merges with "This..." (10) -> 11 words.
    expected = "Hello; This is a very long sentence that is safe."
    assert consolidate_single_word_sentences(text) == expected

def test_no_merge_needed():
    text = "This is four words. This is also four."
    # Both are safe (>= 4 words)
    # Note: consolidate_single_word_sentences strips trailing punc from left side ONLY IF it merges. 
    # Here no merge happens.
    result = consolidate_single_word_sentences(text)
    assert "This is four words.\nThis is also four." in result or "This is four words. This is also four." in result
