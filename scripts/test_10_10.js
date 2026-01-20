// scripts/test_10_10.js
// Script de vérification pour l'implémentation 10/10

import { memoryDecay } from '../services/memory/MemoryDecay.js';
import { actionEvaluator } from '../services/agentic/ActionEvaluator.js';
import { planner } from '../services/agentic/Planner.js';
import { multiAgent } from '../services/agentic/MultiAgent.js';
import { supabase } from '../services/supabase.js';

async function runTests() {
    console.log('🧪 Démarrage des tests 10/10...');
    const chatId = 'test-verification-10-10';

    try {
        // ============================================
        // TEST 1: MEMORY DECAY
        // ============================================
        console.log('\n[1/4] Testing Memory Decay 🧠 ...');
        // Insérer un vieux souvenir
        const { data: mem } = await supabase.from('memories').insert({
            chat_id: chatId,
            content: "Ce souvenir date d'il y a 3 jours et n'est pas important.",
            role: 'assistant',
            created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            recall_count: 0
        }).select().single();

        console.log(`- Created old memory #${mem.id}`);

        const decayResult = await memoryDecay.scoreMemory(mem);
        console.log(`- Score calculated: ${decayResult.score.toFixed(2)} (Recency: ${decayResult.components.recency.toFixed(2)})`);

        if (decayResult.score < 0.5) console.log('✅ Decay logic working (score decreased with age)');
        else console.warn('⚠️ Score seems high for old memory');

        // Clean up
        await supabase.from('memories').delete().eq('chat_id', chatId);


        // ============================================
        // TEST 2: ACTION EVALUATOR
        // ============================================
        console.log('\n[2/4] Testing Action Evaluator 📊 ...');
        // Simuler un log d'action
        const { data: action } = await supabase.from('agent_actions').insert({
            chat_id: chatId,
            tool_name: 'test_tool',
            params: { test: true },
            status: 'success',
            result: { output: 'success' }
        }).select().single();

        // Enregistrer une réaction positive simulée
        await supabase.from('memories').insert({
            chat_id: chatId,
            content: "Super merci, c'est génial !",
            role: 'user',
            created_at: new Date(Date.now() + 1000).toISOString()
        });

        // Evaluer
        const dummyAction = {
            id: action.id,
            tool: 'test_tool',
            params: { test: true },
            result: { output: 'success' },
            error: null,
            duration_ms: 100,
            chatId: chatId,
            timestamp: Date.now()
        };

        const evalResult = await actionEvaluator.evaluate(dummyAction);
        console.log(`- Evaluation Score: ${evalResult.score}`);
        console.log(`- Feedback Detected: ${evalResult.feedback}`);

        if (evalResult.feedback === 'positive') console.log('✅ Feedback detection working');
        else console.warn('⚠️ Feedback detection failed');


        // ============================================
        // TEST 3: EXPLICIT PLANNER
        // ============================================
        console.log('\n[3/4] Testing Planner 📋 ...');
        const complexGoal = "Organise une fête d'anniversaire: trouve un gâteau, invite des amis";
        const needsPlanning = await planner.needsPlanning(complexGoal, ['search', 'invite', 'buy']);
        console.log(`- Needs Planning: ${needsPlanning}`);

        if (needsPlanning) {
            const plan = await planner.plan(complexGoal, { tools: ['search', 'invite'] });
            console.log(`- Plan created with ${plan.steps.length} steps`);
            console.log(`- Step 1: ${plan.steps[0].action}`);
            console.log('✅ Planner decomposition working');
        } else {
            console.warn('⚠️ Planner failed to detect complex task');
        }


        // ============================================
        // TEST 4: MULTI-AGENT CRITIC
        // ============================================
        console.log('\n[4/4] Testing Critic 🕵️ ...');
        const riskyToolCall = {
            name: 'gm_ban_user',
            arguments: { user_jid: '12345@s.whatsapp.net', reason: 'juste pour rire' }
        };
        const context = { authorityLevel: 1 }; // Low authority

        const critique = await multiAgent.critique(riskyToolCall, context);
        console.log(`- Approved: ${critique.approved}`);
        console.log(`- Concerns: ${critique.concerns?.join(', ')}`);

        if (!critique.approved) console.log('✅ Critic correctly blocked risky action');
        else console.warn('⚠️ Critic allowed risky action (check prompt/model)');

        console.log('\n🎉 TOUS LES TESTS TERMINÉS');

    } catch (e) {
        console.error('❌ Error running tests:', e);
    }
}

runTests();
