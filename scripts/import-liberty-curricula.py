#!/usr/bin/env python3
"""Compile reviewed Liberty 2026–27 requirement facts into planner source records.

This offline importer preserves separately reviewed delivery variants and explicit
overlap allocations.  It does not infer degree requirements from program titles.
The source snapshots are native-web extracts of the cited university pages.
"""
from __future__ import annotations
import copy
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKED = '2026-11-10'
BASE = 'https://catalog.liberty.edu/undergraduate/colleges-schools/'
GENED = BASE + 'applied-studies-academic-success/general-education-courses-online-programs/'
RES_GENED = BASE + 'applied-studies-academic-success/general-education-courses-residential-programs/'


def source(sid, title, url):
    return {'id': sid, 'title': title, 'url': url, 'checked': CHECKED}


def row(code, title, credits=3, category='major', group='major-core', sid='', **kwargs):
    result = {'id': code.lower().replace(' ', '-'), 'code': code, 'title': title,
              'credits': credits, 'category': category, 'group': group,
              'upper': bool(code and len(code.split()) > 1 and code.split()[1][0] in '34'),
              'sourceIds': [sid], 'options': []}
    result.update(kwargs)
    return result


def elective(rid, title, credits, category, sid, group=None, **kwargs):
    out = {'id': rid, 'code': '', 'title': title, 'credits': credits,
            'category': category, 'group': group or category, 'upper': False,
            'bucket': True, 'sourceIds': [sid], 'options': [], **kwargs}
    if category == 'electives':
        out['freeElective'] = True
    if kwargs.get('allowedPrefixes'):
        out['allowedCoursePrefixes'] = kwargs['allowedPrefixes']
    if kwargs.get('minimumCourseLevel'):
        out['minCourseLevel'] = kwargs['minimumCourseLevel']
    return out


def online_general(sid, *, associate=False, omit=(), accounting=False):
    """A proposed choice of explicitly approved online general-ed courses.

    Major-course overlap is applied only where the degree's own published course
    sequence identifies that allocation.  A shared course remains one credit row.
    """
    facts = [
        ('ENGL 101', 'Composition and Rhetoric', 3, 'writing'),
        ('COMS 101', 'Speech Communication', 3, 'communication'),
        ('ENGL 102', 'Composition and Literature', 3, 'information-literacy'),
        ('ARTS 209', 'Art as Communication', 3, 'information-literacy'),
        ('MATH 121', 'College Algebra', 3, 'quantitative-reasoning'),
        ('RLGN 104', 'Christian Life and Biblical Worldview', 4, 'biblical-worldview'),
        ('ETHC 101', 'Introduction to Ethics', 3, 'critical-thinking'),
        ('CSTU 101', 'Western Culture', 3, 'cultural-studies'),
        ('BIOL 102', 'Principles of Human Biology', 3, 'natural-science'),
        ('PSYC 101', 'General Psychology', 3, 'social-science'),
        ('BIBL 104', 'Survey of Old and New Testament', 4, 'christianity-contexts'),
        ('THEO 104', 'Introduction to Theology Survey', 4, 'christianity-contexts'),
    ]
    if associate:
        facts = [x for x in facts if x[0] != 'ARTS 209']
    if accounting:
        # The accounting online sequence explicitly uses BUSI 201 in one
        # information-literacy position and ECON 213 as its social-science row.
        facts = [x for x in facts if x[0] not in ['ARTS 209', 'PSYC 101']]
    return [row(c, t, cr, 'general', g, sid,
                sourceIds=[sid, 'liberty-online-approved-gened'],
                allocationBasis='Proposed course choice from the official online approved general-education list; degree-specific restrictions still apply.')
            for c, t, cr, g in facts if c not in omit]


def make_model(mid, route_ids, title, sid, url, requirements, *, total=120,
               mode='online', major_basis=0, associate=False, notes=(), parent_id=None):
    out = {'id': mid, 'routeIds': route_ids, 'school': 'Liberty University',
           'title': title, 'format': 'Online' if mode == 'online' else 'Residential',
           'modalities': [mode], 'level': 'associate' if associate else 'bachelor',
           'catalog': '2026–2027', 'catalogYear': '2026-2027', 'totalCredits': total,
           'creditSystem': 'semester', 'institutionMinCredits': 15 if associate else 30,
           'externalMaxCredits': 45 if associate else 90,
           'majorInstitutionFraction': 0.25, 'majorResidencyBasisCredits': major_basis,
           'sources': [source(sid, title + ' official 2026–27 degree completion plan', url)],
           'requirements': requirements, 'coverage': 'complete',
           'coverageLabel': 'Source-linked full-credit curriculum with proposed approved-course choices; transfer matches require separate evidence.',
           'completeExecutablePathway': False,
           'rulesNotes': list(notes),
           'unresolved': [
               'Confirm individual catalog eligibility, major-course residency allocation, course prerequisites, and written transfer evaluation.',
               'Outside-course equivalencies must be sourced separately; a university requirement is not evidence that a particular accelerated course transfers.',
           ],
           'graduationRequirements': [
               {'id': 'gpa', 'title': 'Overall GPA', 'detail': 'At least 2.0 overall GPA.', 'sourceIds': [sid]},
               {'id': 'degree-application', 'title': 'Graduation application', 'detail': 'Submit the degree completion application within the last semester of the anticipated graduation date.', 'sourceIds': [sid]},
           ]}
    if not associate:
        out['upperMinCredits'] = 30
    if parent_id:
        out['catalogParentId'] = parent_id
    # UNIV 104 is printed as 0–3, so this ledger is the explicit zero-credit
    # published scenario, not an assertion that every student receives a waiver.
    if mode == 'online':
        out['obligations'] = [
            {'title': 'UNIV 104 evaluation', 'notes': 'The degree plan lists UNIV 104 as 0–3 credits. This proposed ledger uses the zero-credit case. Obtain Liberty confirmation; if 3 credits are required, adjust elective allocation within the printed range or retain additional graduation credit.', 'sourceIds': [sid]},
        ]
        out['rulesNotes'].append('The source prints UNIV 104 as 0–3 credits; zero credits are a scenario requiring individual confirmation.')
        out['rulesNotes'].append('Do not automatically remove RLGN 104 at 45 transfer credits or THEO 104 at 60 transfer credits. The source permits those waivers, but this ledger retains both courses until individual evaluation.')
        out['unresolved'].append('State-specific online general-education requirements may differ; consult the applicable state degree completion plan.')
    assert sum(r['credits'] for r in requirements) == total, (mid, sum(r['credits'] for r in requirements), total)
    assert len({r['id'] for r in requirements}) == len(requirements), mid
    return out


def compile_models():
    catalog = json.loads((ROOT / 'dist/data/program-catalog.json').read_text())
    liberty = [p for p in catalog['programs'] if p['schoolId'] == 'liberty']
    exact = {p['title']: p['id'] for p in liberty}
    psychology_parent = exact['Psychology Major (B.S.)']
    aa_parent = exact['Psychology Major (A.A.)']
    accounting_parent = exact['Accounting & Data Analysis Major (B.S.)']
    models = []
    sources = [source('liberty-online-approved-gened', 'Liberty approved general-education courses for online programs, 2026–27', GENED),
               source('liberty-residential-approved-gened', 'Liberty approved general-education courses for residential programs, 2026–27', RES_GENED)]

    # Psychology B.S.: BIOL 102 and PSYC 101 satisfy the natural/social science
    # positions in the published sequence.  They are counted once in foundations.
    sid = 'liberty-psychology-bs-online-2026'
    url = BASE + 'behavioral-sciences/psychology-major-bs/psychology-online/'
    reqs = online_general(sid, omit=('BIOL 102', 'PSYC 101'))
    for c, t in [('BIOL 102', 'Principles of Human Biology'), ('PSYC 101', 'General Psychology'), ('PSYC 210', 'Developmental Psychology'), ('PSYC 354', 'Statistics for the Social Sciences')]:
        reqs.append(row(c, t, sid=sid, group='major-foundations'))
    core = [('PSYC 255', 'Introduction to Research'), ('PSYC 310', 'Cognitive Psychology'),
            ('PSYC 312', 'Social Psychology'), ('PSYC 320', 'Behavior Modification'),
            ('PSYC 341', 'Psychology of Personality'), ('PSYC 351', 'Multicultural Counseling and Research Issues'),
            ('PSYC 355', 'Statistics in Psychology'), ('PSYC 365', 'Psychological Foundations of Learning'),
            ('PSYC 380', 'Physiological Psychology'), ('PSYC 420', 'Psychology and Christianity'),
            ('PSYC 421', 'Psychological Measurement'), ('PSYC 430', 'Abnormal Psychology'),
            ('PSYC 491', 'Capstone in Psychology')]
    reqs.extend(row(c, t, sid=sid) for c, t in core)
    reqs[-1]['allowedCourseCodes'] = ['PSYC 491', 'PSYC 499']
    reqs[-1]['choiceNote'] = 'The source permits PSYC 491 or PSYC 499; this proposed route chooses PSYC 491.'
    reqs.append(elective('free-electives', 'Free electives — courses not already counted in this degree', 36, 'electives', sid,
                         allowedCreditsRange=[27, 36], excludeAlreadyUsed=True))
    m = make_model('curriculum-liberty-psychology-bs-online', [psychology_parent], 'Psychology (B.S.) — Online', sid, url, reqs, major_basis=51,
                   notes=['A 120-credit proposed allocation: 33 unique general-education credits + 12 major-foundation credits + 39 major-course credits + 36 free-elective credits.',
                          'BIOL 102 also fulfills the natural-science category; PSYC 101 also fulfills the social-science category. Their 6 credits are counted once.',
                          'The capstone/internship choice is PSYC 491 or PSYC 499, not both. The proposed route selects PSYC 491.'])
    m['overlaps'] = [{'requirementId': 'biol-102', 'alsoSatisfies': 'Natural Science Elective', 'creditsCountedOnce': 3}, {'requirementId': 'psyc-101', 'alsoSatisfies': 'Social Science Elective', 'creditsCountedOnce': 3}]
    models.append(m)

    # Psychology A.A.: only BIOL 102 overlaps general education in the published
    # sequence.  PSYC 101 is retained separately from its social-science elective.
    sid = 'liberty-psychology-aa-online-2026'
    url = BASE + 'behavioral-sciences/psychology-major-aa/psychology-online/'
    reqs = online_general(sid, associate=True, omit=('BIOL 102',))
    # Avoid allocating PSYC 101 twice: choose another explicitly approved social
    # science course for the A.A. general-education category.
    for r in reqs:
        if r['code'] == 'PSYC 101':
            r.update(id='soci-200', code='SOCI 200', title='Introduction to Sociology')
    reqs.append(row('BIOL 102', 'Principles of Human Biology', sid=sid, group='major-foundations'))
    for c, t in [('PSYC 101', 'General Psychology'), ('PSYC 210', 'Developmental Psychology'), ('PSYC 255', 'Introduction to Research'), ('PSYC 341', 'Psychology of Personality')]:
        reqs.append(row(c, t, sid=sid))
    reqs.append(row('PSYC 221', 'Psychology of Childhood', sid=sid,
                    allowedCourseCodes=['PSYC 221', 'PSYC 231', 'PSYC 235'],
                    choiceNote='Choose one of PSYC 221, PSYC 231 or PSYC 235; this proposed route selects PSYC 221.'))
    for n in range(1, 4):
        reqs.append(elective('psychology-elective-' + str(n), 'Psychology elective ' + str(n), 3, 'major', sid, 'psychology-electives',
                             allowedPrefixes=['PSYC'], excludeAlreadyUsed=True,
                             choiceNote='Any PSYC course not already required in the major.'))
    m = make_model('curriculum-liberty-psychology-aa-online', [aa_parent], 'Psychology (A.A.) — Online', sid, url, reqs, total=60, major_basis=27, associate=True,
                   notes=['A 60-credit proposed allocation: 33 unique general-education credits + BIOL 102 (3) + major courses and psychology choices (24).',
                          'BIOL 102 also fulfills natural science; its 3 credits are counted once. The social-science choice is SOCI 200, so the required PSYC 101 is not duplicated.'])
    m['overlaps'] = [{'requirementId': 'biol-102', 'alsoSatisfies': 'Natural Science Elective', 'creditsCountedOnce': 3}]
    models.append(m)

    accounting_core = [('ACCT 211', 'Financial Principles'), ('ACCT 212', 'Managerial Principles'),
        ('ACCT 301', 'Intermediate Financial Accounting I'), ('ACCT 302', 'Intermediate Financial Accounting II'),
        ('ACCT 311', 'Corporate Accounting'), ('ACCT 332', 'Accounting and Control'),
        ('ACCT 340', 'Accounting Ethics'), ('ACCT 370', 'Financial Statement Analysis'),
        ('ACCT 401', 'Individual Taxation'), ('ACCT 402', 'Consolidations and Advanced Accounting Topics'),
        ('ACCT 403', 'Fund Accounting for Government and Not for Profits'), ('ACCT 404', 'Assurance and Attestation'),
        ('ACCT 406', 'Principles of Forensic Accounting'), ('ACCT 412', 'Corporate/Partnership/Estate Taxation'),
        ('ACCT 470', 'Advanced Data Analysis and Reporting'), ('BUSI 301', 'Legal and Ethical Concepts for Decision Makers'),
        ('BUSI 320', 'Finance Principles'), ('BUSI 330', 'Principles of Marketing'),
        ('BUSI 400', 'Strategic Planning/Business Policy'), ('BUSI 411', 'Operations Strategy')]
    sid = 'liberty-accounting-bs-online-2026'
    url = BASE + 'business/accounting-data-analysis-major-bs/accounting-data-analysis-bs-online/'
    reqs = online_general(sid, accounting=True)
    for c, t in [('BUSI 201', 'Intermediate Business Computer Applications'), ('BUSI 205', 'Introduction to Business Research Methods'), ('ECON 213', 'Principles of Microeconomics')]:
        reqs.append(row(c, t, sid=sid, group='major-foundations'))
    reqs.extend(row(c, t, sid=sid) for c, t in accounting_core)
    reqs.append(elective('free-electives', 'Free electives — courses not already counted in this degree', 18, 'electives', sid,
                         allowedCreditsRange=[9, 18], excludeAlreadyUsed=True))
    m = make_model('curriculum-liberty-accounting-bs-online', [accounting_parent], 'Accounting & Data Analysis (B.S.) — Online', sid, url, reqs, major_basis=69,
                   notes=['A 120-credit proposed allocation: 33 unique general-education credits + 9 major-foundation credits + 60 major-course credits + 18 free-elective credits.',
                          'The published online sequence uses BUSI 201 as an information-literacy course and ECON 213 as social science; those 6 credits are counted once.',
                          'The online major requires ACCT 340 and BUSI 400. The residential degree instead lists ACCT 350 and BUSI 490; the two modes are not interchangeable.',
                          'An internship of no more than 6 hours is recommended, not automatically added as an additional required course.'])
    m['overlaps'] = [{'requirementId': 'busi-201', 'alsoSatisfies': 'Information Literacy Elective', 'creditsCountedOnce': 3}, {'requirementId': 'econ-213', 'alsoSatisfies': 'Social Science Elective', 'creditsCountedOnce': 3}]
    models.append(m)

    # Resident variant is retained separately. Its parent catalogue route is a
    # program family; root integration must create/select its actual mode variant.
    sid = 'liberty-accounting-bs-residential-2026'
    url = BASE + 'business/accounting-data-analysis-major-bs/accounting-data-analysis-bs-resident/'
    resident_fixed = [('ENGL 101', 'Composition and Rhetoric', 3), ('UNIV 101', 'Foundational Skills', 1),
                      ('RLGN 105', 'Introduction to Biblical Worldview', 2), ('EVAN 101', 'Evangelism and the Christian Life', 2),
                      ('BIBL 105', 'Old Testament Survey', 2), ('BIBL 110', 'New Testament Survey', 2),
                      ('THEO 201', 'Theology Survey I', 2), ('THEO 202', 'Theology Survey II', 2)]
    reqs = [row(c, t, cr, 'general', 'general', sid) for c, t, cr in resident_fixed]
    for n, title in enumerate(['Communications elective', 'Information literacy elective', 'Information literacy elective', 'Math elective — MATH 114 or higher', 'Critical thinking elective', 'Cultural studies elective', 'Natural science elective'], 1):
        reqs.append(elective('general-choice-' + str(n), title, 3, 'general', sid,
                             choiceNote='Choose an approved residential general-education course; exact alternatives need receiving-school confirmation.'))
    for c, t in [('BUSI 201', 'Intermediate Business Computer Applications'), ('BUSI 205', 'Introduction to Business Research Methods'), ('ECON 213', 'Principles of Microeconomics')]:
        reqs.append(row(c, t, sid=sid, group='major-foundations'))
    resident_core = [(('ACCT 350', 'Accounting Ethics and Professional Responsibility') if c == 'ACCT 340' else ('BUSI 490', 'Capstone') if c == 'BUSI 400' else (c, t)) for c, t in accounting_core]
    reqs.extend(row(c, t, sid=sid) for c, t in resident_core)
    reqs.append(elective('free-electives', 'Free electives — courses not already counted in this degree', 14, 'electives', sid,
                         allowedCreditsRange=[8, 14], excludeAlreadyUsed=True))
    m = make_model('curriculum-liberty-accounting-bs-residential', [], 'Accounting & Data Analysis (B.S.) — Residential', sid, url, reqs, mode='campus', major_basis=69,
                   parent_id=accounting_parent,
                   notes=['A 120-credit zero-technology-assessment scenario: 37 unique general-education credits + 9 major-foundation credits + 60 major-course credits + 14 free-elective credits.',
                          'The published resident sequence uses ECON 213 as social science; its 3 credits are counted once.',
                          'Technology competency is printed as 0–3 credits. The zero-credit scenario requires passing the university assessment; otherwise adjust elective allocation.',
                          'The residential major uses ACCT 350 and BUSI 490, not the online ACCT 340/BUSI 400 pair.',
                          'RLGN 105/EVAN 101 waivers at 45 transfer credits and THEO 201/THEO 202 waivers at 60 require individual evaluation; no automatic removal occurs.'])
    m['overlaps'] = [{'requirementId': 'econ-213', 'alsoSatisfies': 'Social Science Elective', 'creditsCountedOnce': 3}]
    m['obligations'] = [{'title': 'Technology competency', 'notes': 'Pass the computer assessment or complete the applicable INFT course (0–3 source credits).', 'sourceIds': [sid]}, {'title': 'Christian/Community Service', 'notes': 'Satisfy applicable CSER obligations; these are not extra academic credits in this ledger.', 'sourceIds': [sid]}]
    models.append(m)

    # The Addictions & Recovery page was separately checked: the 12-credit
    # foundations and 39-credit core exactly match the base online B.S.; its
    # distinct nine-credit cognate replaces nine of the free-elective credits.
    base_psych = copy.deepcopy(models[0])
    sid = 'liberty-psychology-addictions-online-2026'
    url = BASE + 'behavioral-sciences/psychology-major-bs/addictions-recovery-online/'
    reqs = copy.deepcopy(base_psych['requirements'])
    for r in reqs:
        r['sourceIds'] = [sid] + (['liberty-online-approved-gened'] if r['category'] == 'general' else [])
        if r['id'] == 'free-electives':
            r.update(credits=27, allowedCreditsRange=[18, 27])
    reqs.extend([
        row('PSYC 305', 'Overview of Theory and Treatment of Substance Abuse', sid=sid, group='addictions-recovery-cognate'),
        row('PSYC 307', 'Treatment and Recovery of Addictions', sid=sid, group='addictions-recovery-cognate'),
        row('PSYC 306', 'Addictions and Recovery elective — proposed PSYC 306 choice', sid=sid, group='addictions-recovery-cognate',
            allowedCourseCodes=['PSYC 306', 'PSYC 308', 'PSYC 309'],
            choiceNote='Choose one of PSYC 306, PSYC 308 or PSYC 309. The proposed code choice needs prerequisite and offering review.'),
    ])
    m = make_model('curriculum-liberty-psychology-addictions-online', [], 'Psychology (B.S.) — Addictions & Recovery — Online', sid, url, reqs, major_basis=60,
                   parent_id=psychology_parent,
                   notes=['A 120-credit proposed allocation: 33 unique general education + 12 foundations + 39 core psychology + 9 addictions/recovery cognate + 27 free electives.',
                          'The target concentration source was separately checked; its foundation and core course codes match the general online Psychology B.S.',
                          'BIOL 102 and PSYC 101 also satisfy natural/social science. The capstone/internship alternative is counted once.'])
    m['overlaps'] = copy.deepcopy(base_psych['overlaps'])
    m['routeSuffix'] = 'addictions-recovery-online'
    models.append(m)

    # Computer Science general/residential: all six named foundations have
    # explicit approved general-ed placements.  This preserves all required
    # foundation courses while counting their twenty credits once.
    cs_parent = exact['Computer Science Major (B.S.)']
    sid = 'liberty-computer-science-general-residential-2026'
    url = BASE + 'business/computer-science-major-bs/general-resident/'
    cs_general = [('ENGL 101', 'Composition and Rhetoric', 3), ('UNIV 101', 'Foundational Skills', 1),
                  ('RLGN 105', 'Introduction to Biblical Worldview', 2), ('EVAN 101', 'Evangelism and the Christian Life', 2),
                  ('BIBL 105', 'Old Testament Survey', 2), ('BIBL 110', 'New Testament Survey', 2),
                  ('THEO 201', 'Theology Survey I', 2), ('THEO 202', 'Theology Survey II', 2),
                  ('ETHC 101', 'Introduction to Ethics', 3), ('CSTU 101', 'Western Culture', 3)]
    reqs = [row(c, t, cr, 'general', 'general', sid, sourceIds=[sid, 'liberty-residential-approved-gened']) for c, t, cr in cs_general]
    cs_foundations = [('BUSI 240', 'Organizational Behavior and Management', 3, 'Social Science Elective'),
                      ('CSCN 110', 'Introduction to Computer Sciences', 3, 'Information Literacy Elective'),
                      ('CSCN 111', 'Programming In C++ Beginner', 3, 'Information Literacy Elective'),
                      ('ENGR 270', 'Technical Communication', 3, 'Communications Elective'),
                      ('MATH 131', 'Calculus and Analytic Geometry I', 4, 'Math Elective'),
                      ('PHYS 201', 'General Physics I', 4, 'Natural Science Elective')]
    for c, t, cr, placement in cs_foundations:
        reqs.append(row(c, t, cr, 'major', 'major-foundations', sid,
                        sourceIds=[sid, 'liberty-residential-approved-gened'], alsoSatisfies=[placement],
                        allocationBasis='Required major foundation allocated to its separately approved general-education category; counted once.'))
    cs_core = [('CSCN 112', 'Programming in C++ Advanced'), ('CSCN 215', 'Data Structures and Algorithms using C++'),
               ('CSCN 230', 'Business Data Communications and Networks'),
               ('CSCN 321', 'Applied Data Science & Machine Learning Methods with R & Python'),
               ('CSCN 326', 'Database Design and Management'), ('CSCN 340', 'Information Security Concepts and Principles'),
               ('CSCN 342', 'Computer Architecture'), ('CSCN 345', 'Linux Operating System'),
               ('CSCN 352', 'Windows System Administration'), ('CSCN 355', 'Network Architecture, Protocols, and Theory'),
               ('CSCN 434', 'Programming Language Design and Compiler Theory'), ('CSCN 443', 'Operating Systems Design'),
               ('CSCN 471', 'Software Engineering Management'), ('CSCN 481', 'Computer Sciences Practicum I'),
               ('CSCN 482', 'Computer Sciences Practicum II')]
    for c, t in cs_core:
        reqs.append(row(c, t, sid=sid, institutionalOnly=True,
                        conditions=['The degree-specific ABET footnote requires this major-course section to be taken residentially. Exceptions require ABET coordinator review and Department Chair approval.']))
    for c, t in [('MATH 211', 'Introduction to Statistical Analysis'), ('MATH 250', 'Introduction to Discrete Mathematics'), ('MATH 350', 'Discrete Mathematics')]:
        reqs.append(row(c, t, sid=sid, group='quantitative-studies'))
    reqs.append(elective('quantitative-math-elective', 'Approved quantitative mathematics elective — three-credit scenario', 3, 'major', sid, 'quantitative-studies',
                         allowedCourseCodes=['MATH 132', 'MATH 221', 'MATH 301', 'MATH 302', 'MATH 307'],
                         choiceNote='Choose 3–4 credits from the published list, or another department-approved mathematics course. This ledger allocates the three-credit case; the final course and credits must be selected. MATH 132 is reserved for the separate technical elective and cannot be reused.'))
    reqs.append(elective('lab-science-elective', 'Approved science course with lab component', 4, 'major', sid, 'lab-sciences', bucket=False,
                         requiresLab=True, choiceNote='A science course with a lab component is required. PHYS 101 and PHYS 103 are excluded. A Physics choice must meet the published PHYS 202/PHYS 202L or higher requirement; confirm the exact package and credits.'))
    reqs.append(row('MATH 132', 'Calculus and Analytic Geometry II', 4, 'major', 'technical-electives', sid,
                    sourceIds=[sid, 'liberty-residential-approved-gened'],
                    choiceNote='The technical elective permits advanced mathematics MATH 132 or higher not otherwise used. This proposed choice reserves MATH 132 here; the quantitative math elective must use a different approved course.'))
    reqs.append(row('CSCN 354', 'Fundamentals of Distributed Systems', sid=sid, group='general-cognate', institutionalOnly=True))
    for n in [1, 2]:
        reqs.append(elective('computer-science-upper-elective-' + str(n), 'Upper-level Computer Science elective ' + str(n), 3, 'major', sid, 'general-cognate',
                             upper=True, institutionalOnly=True, allowedPrefixes=['CSCN'], minimumCourseLevel=300, maximumCourseLevel=499, excludeAlreadyUsed=True,
                             choiceNote='Choose a 300–400-level CSCN course not already required in this degree. This cognate section is residentially required under the degree-specific ABET footnote.'))
    reqs.append(row('CSIS 212', 'Computer Science programming-language elective — proposed CSIS 212 choice', sid=sid, group='general-cognate', institutionalOnly=True,
                    allowedCourseCodes=['CSIS 209', 'CSIS 212', 'CSIS 244', 'CSIS 312', 'CSIS 315', 'CSCN 315', 'CSIS 316', 'CSCN 316', 'CSIS 354', 'CSCN 354'],
                    choiceNote='The proposed programming-language choice is CSIS 212. The source allows the listed alternatives, subject to prerequisites and department approval. CSCN 354 is already used and cannot be counted again.'))
    reqs.append(elective('free-elective-one-credit', 'Free elective — one credit in the published course sequence', 1, 'electives', sid, excludeAlreadyUsed=True))
    m = make_model('curriculum-liberty-computer-science-general-residential', [], 'Computer Science (B.S.) — General — Residential', sid, url, reqs, mode='campus', major_basis=97,
                   parent_id=cs_parent,
                   notes=['A 120-credit proposed allocation: 22 unique general education + 20 foundations + 65 major/quantitative/lab/technical credits + 12 general-cognate credits + 1 free elective.',
                          'All 20 foundation credits have source-approved general-education placements and are counted once: ENGR 270 communications, CSCN 110 and CSCN 111 information literacy, MATH 131 mathematics, PHYS 201 natural science, and BUSI 240 social science.',
                          'The degree-specific ABET footnotes require all 45 major-core and 12 general-cognate credits residentially. Those 57 credits remain university-only, even when a general transfer table has a similar receiving-course code.',
                          'The source permits a 3–4-credit quantitative math choice and a 0–3-credit technology requirement. This ledger uses a three-credit math selection and zero-credit assessment scenario; changing those choices may raise the published 120–124-credit course sequence total.',
                          'MATH 132 is used once as the technical elective. A different approved three-credit course must fill the quantitative math elective.'])
    m['routeSuffix'] = 'general-residential'
    m['minimumDegreeCredits'] = 120
    m['publishedCreditRange'] = {'min': 120, 'max': 124}
    m['overlaps'] = [{'requirementId': c.lower().replace(' ', '-'), 'alsoSatisfies': placement, 'creditsCountedOnce': cr} for c, _, cr, placement in cs_foundations]
    m['obligations'] = [{'title': 'Technology competency assessment', 'notes': 'The zero-credit scenario requires passing the computer assessment. Otherwise complete the applicable INFT course and revise the allocation within the published credit range.', 'sourceIds': [sid]},
                        {'title': 'ABET residency', 'notes': 'Complete the 45-credit major-course section and 12-credit general cognate residentially. Any exception needs ABET coordinator review and Department Chair approval.', 'sourceIds': [sid]},
                        {'title': 'Christian/Community Service', 'notes': 'Satisfy applicable CSER obligations before graduation.', 'sourceIds': [sid]}]
    models.append(m)

    # Business A.A. is independently reviewed from its official online plan.
    # BUSI 201 is the sole selected overlap, occupying information literacy.
    business_aa_parent = exact['Business Major (A.A.)']
    sid = 'liberty-business-aa-online-2026'
    url = BASE + 'business/business-major-aa/business-aa-online/'
    reqs = online_general(sid, associate=True)
    reqs = [r for r in reqs if r['code'] != 'ENGL 102']
    for r in reqs:
        if r['code'] == 'PSYC 101':
            r.update(id='soci-200', code='SOCI 200', title='Introduction to Sociology')
    reqs.extend([row('BUSI 201', 'Intermediate Business Computer Applications', sid=sid, group='major-foundations'),
                 row('BUSI 230', 'Introduction to Probability and Statistics', sid=sid, group='major-foundations')])
    for c, t in [('ACCT 211', 'Financial Principles'), ('ACCT 212', 'Managerial Principles'), ('BUSI 300', 'Business Communications'),
                 ('BUSI 301', 'Legal and Ethical Concepts for Decision Makers'), ('BUSI 303', 'International Business'),
                 ('BUSI 310', 'Principles of Management'), ('ECON 213', 'Principles of Microeconomics')]:
        reqs.append(row(c, t, sid=sid))
    m = make_model('curriculum-liberty-business-aa-online', [], 'Business (A.A.) — Online', sid, url, reqs, total=60, major_basis=27, associate=True,
                   parent_id=business_aa_parent,
                   notes=['A 60-credit proposed allocation: 33 unique general education + 6 foundations + 21 major credits. The zero-free-elective case lies within the printed 0–3-credit elective range.',
                          'BUSI 201 fulfills the information-literacy category and is counted once. Required major-core BUSI 300 and ECON 213 are retained separately from the proposed COMS 101/SOCI 200 general-education choices.'])
    m['overlaps'] = [{'requirementId': 'busi-201', 'alsoSatisfies': 'Information Literacy Elective', 'creditsCountedOnce': 3}]
    models.append(m)

    # Human Services has its own, separately reviewed foundations and constrained
    # upper-level elective categories; it is not the Psychology curriculum.
    human_parent = exact['Human Services Major (B.S.)']
    sid = 'liberty-human-services-bs-online-2026'
    url = BASE + 'behavioral-sciences/human-services-major-bs/human-services-online/'
    reqs = online_general(sid, omit=('BIOL 102', 'ENGL 102', 'MATH 121', 'PSYC 101'))
    foundations = [('BIOL 102', 'Principles of Human Biology'), ('ENGL 102', 'Composition and Literature'),
                   ('MATH 201', 'Introduction to Probability and Statistics'), ('PSYC 101', 'General Psychology'),
                   ('PSYC 210', 'Developmental Psychology')]
    for c, t in foundations:
        r = row(c, t, sid=sid, group='major-foundations')
        if c == 'MATH 201':
            r.update(allowedCourseCodes=['MATH 201', 'PSYC 354'], choiceNote='MATH 201 or PSYC 354; this route selects MATH 201. The source sequence explicitly uses this statistics choice as mathematics.')
        if c == 'PSYC 210':
            r.update(allowedCourseCodes=['PSYC 210', 'SOWK 300'], choiceNote='PSYC 210 or SOWK 300; this proposed route selects PSYC 210.')
        reqs.append(r)
    for c, t in [('HSER 201', 'Survey of Human Services'), ('HSER 270', 'Ethics in Professional Helping'),
                 ('HSER 301', 'Administration & Case Management'), ('HSER 415', 'Case Management Practice in Human Services'),
                 ('HSER 497', 'Human Services Capstone'), ('PSYC 255', 'Introduction to Research'),
                 ('PSYC 317', 'Crisis Intervention'), ('PSYC 351', 'Multicultural Counseling and Research Issues'),
                 ('PSYC 405', 'Group Dynamics'), ('PSYC 420', 'Psychology and Christianity'), ('PSYC 430', 'Abnormal Psychology'),
                 ('SOWK 250', 'Health of the Social Worker'), ('SOWK 260', 'Chemical Dependency'), ('SOWK 325', 'Social Welfare and Policy')]:
        r = row(c, t, sid=sid)
        if c == 'HSER 497':
            r.update(allowedCourseCodes=['HSER 497', 'HSER 499'], choiceNote='This route selects the capstone, HSER 497, in the three-credit case. HSER 499 internship is an alternative with 3–6 source credits and approval requirements; do not count both.')
        if c == 'PSYC 430':
            r.update(allowedCourseCodes=['PSYC 430', 'SOWK 431'], choiceNote='PSYC 430 or SOWK 431; this proposed route selects PSYC 430.')
        reqs.append(r)
    reqs.append(elective('human-services-psychology-elective', 'Upper-level Psychology elective', 3, 'major', sid, 'major-electives', upper=True,
                         allowedPrefixes=['PSYC'], minimumCourseLevel=300, maximumCourseLevel=499, excludeAlreadyUsed=True))
    reqs.append(elective('human-services-social-work-elective', 'Approved Social Work elective', 3, 'major', sid, 'major-electives', upper=True,
                         allowedCourseCodes=['SOWK 425', 'SOWK 432', 'SOWK 435', 'SOWK 439', 'SOWK 452', 'SOWK 462', 'SOWK 495', 'SOWK 497'], excludeAlreadyUsed=True))
    for n in range(1, 4):
        reqs.append(elective('human-services-mixed-elective-' + str(n), 'Upper-level Psychology or Social Work elective ' + str(n), 3, 'major', sid, 'major-electives', upper=True,
                             allowedPrefixes=['PSYC', 'SOWK'], minimumCourseLevel=300, maximumCourseLevel=499, excludeAlreadyUsed=True))
    reqs.append(elective('free-electives', 'Free electives — courses not already counted in this degree', 21, 'electives', sid,
                         allowedCreditsRange=[3, 21], excludeAlreadyUsed=True))
    m = make_model('curriculum-liberty-human-services-bs-online', [], 'Human Services (B.S.) — Online', sid, url, reqs, major_basis=72,
                   parent_id=human_parent,
                   notes=['A 120-credit proposed allocation: 27 unique general education + 15 foundations + 57 major/capstone/elective credits + 21 free-elective credits.',
                          'The published sequence uses BIOL 102 as natural science, ENGL 102 as information literacy, MATH 201 or PSYC 354 as mathematics, and PSYC 101 as social science. These 12 foundation credits are counted once.',
                          'The capstone scenario uses three credits. Selecting a six-credit internship or a three-credit UNIV 104 changes elective allocation and may increase the published 120–129-credit course sequence total.',
                          'Advanced mental-health practice, therapy or professional counseling may require graduate education and appropriate licensure; the bachelor degree alone does not establish that eligibility.'])
    m['overlaps'] = [{'requirementId': code.lower().replace(' ', '-'), 'alsoSatisfies': placement, 'creditsCountedOnce': 3} for code, placement in [
        ('BIOL 102', 'Natural Science Elective'), ('ENGL 102', 'Information Literacy Elective'),
        ('MATH 201', 'Math Elective'), ('PSYC 101', 'Social Science Elective')]]
    m['obligations'].append({'title': 'HSER 465 and capstone/internship approval', 'notes': 'The source lists zero-credit HSER 465 internship proposal/preparation. Confirm its applicability and required department approval for the selected capstone or internship route; zero credits do not remove an obligation.', 'sourceIds': [sid]})
    m['publishedCreditRange'] = {'min': 120, 'max': 129}
    models.append(m)

    # The interdisciplinary associate uses an explicitly unrestricted general-
    # elective block within its major section; it is not a 23-credit course.
    interdisciplinary_aa_parent = exact['Interdisciplinary Studies Major (A.A.)']
    sid = 'liberty-interdisciplinary-aa-online-2026'
    url = BASE + 'arts-sciences/interdisciplinary-studies-major-aa/interdisciplinary-studies-aa-online/'
    reqs = online_general(sid, associate=True)
    reqs.append(row('INDS 200', 'Interdisciplinary Careers', 1, 'major', 'major-core', sid))
    reqs.append(elective('interdisciplinary-general-electives', 'General electives — courses not already counted in this degree', 23, 'major', sid, 'general-electives',
                         freeElective=True, allowedCreditsRange=[20, 23], excludeAlreadyUsed=True,
                         choiceNote='The official plan allows any course not already required in the degree; limiting choices to two course prefixes is recommended, not presented as a hard admission rule.'))
    m = make_model('curriculum-liberty-interdisciplinary-aa-online', [], 'Interdisciplinary Studies (A.A.) — Online', sid, url, reqs, total=60, major_basis=24, associate=True,
                   parent_id=interdisciplinary_aa_parent,
                   notes=['A 60-credit zero-UNIV-104 scenario: 36 general-education credits + INDS 200 (1) + 23 unrestricted general-elective credits.',
                          'The elective block is counted in the source major section. It allows courses not otherwise required; two course prefixes are recommended, not an invented categorical limit.',
                          'A three-credit UNIV 104 requirement can be accommodated by reducing general electives from 23 to 20 after individual evaluation.'])
    models.append(m)

    business_bs_parent = exact['Business Administration & Data Analysis Major (B.S.)']
    sid = 'liberty-business-bs-online-2026'
    url = BASE + 'business/business-administration-data-analysis-major-bs/business-administration-bs-online/'
    reqs = online_general(sid, omit=('ARTS 209', 'MATH 121', 'ETHC 101', 'PSYC 101'))
    foundations = [('BUSI 201', 'Intermediate Business Computer Applications'), ('BUSI 205', 'Introduction to Business Research Methods'),
                   ('BUSI 230', 'Introduction to Probability and Statistics'), ('BUSI 240', 'Organizational Behavior and Management'),
                   ('ECON 213', 'Principles of Microeconomics')]
    reqs.extend(row(c, t, sid=sid, group='major-foundations') for c, t in foundations)
    for c, t in [('ACCT 211', 'Financial Principles'), ('ACCT 212', 'Managerial Principles'), ('ACCT 370', 'Financial Statement Analysis'),
                 ('BUSI 301', 'Legal and Ethical Concepts for Decision Makers'), ('BUSI 303', 'International Business'),
                 ('BUSI 305', 'Business Analysis for Decision Making'), ('BUSI 320', 'Finance Principles'), ('BUSI 330', 'Principles of Marketing'),
                 ('BUSI 342', 'Human Resource Management'), ('BUSI 400', 'Strategic Planning/Business Policy'),
                 ('BUSI 411', 'Operations Strategy'), ('ECON 214', 'Principles of Macroeconomics')]:
        reqs.append(row(c, t, sid=sid))
    # The named major supplies 27 upper-level credits; reserve an explicit
    # upper-level free-elective choice to meet the published overall minimum30.
    reqs.append(elective('upper-free-elective', 'Upper-level free elective — course not otherwise counted', 3, 'electives', sid,
                         upper=True, minCourseLevel=300, minimumCourseLevel=300, maximumCourseLevel=499, excludeAlreadyUsed=True))
    reqs.append(elective('free-electives', 'Free electives — courses not already counted in this degree', 39, 'electives', sid,
                         allowedCreditsRange=[27, 42], excludeAlreadyUsed=True,
                         choiceNote='This39-credit block plus the separate3-credit upper-level free elective forms42free-elective credits, within the published27–42range.'))
    m = make_model('curriculum-liberty-business-bs-online', [], 'Business Administration & Data Analysis (B.S.) — Online', sid, url, reqs, major_basis=51,
                   parent_id=business_bs_parent,
                   notes=['A120-credit proposed allocation:27unique general education +15foundations +36major core +42free electives.',
                          'The source sequence explicitly allocates BUSI201 to information literacy, BUSI205 to critical thinking, BUSI230 to mathematics and BUSI240 to social science. These12foundation credits count once.',
                          'The major core supplies27upper-level credits; the proposed allocation reserves one3-credit upper-level free elective to meet the30-credit graduation minimum.',
                          'A three-credit UNIV104 requirement would reduce free elective allocation from42to39; preserve the total120-credit graduation ledger after individual evaluation.'])
    m['overlaps'] = [{'requirementId': c.lower().replace(' ', '-'), 'alsoSatisfies': placement, 'creditsCountedOnce': 3} for c, placement in [
        ('BUSI 201', 'Information Literacy Elective'), ('BUSI 205', 'Critical Thinking Elective'),
        ('BUSI 230', 'Math Elective'), ('BUSI 240', 'Social Science Elective')]]
    models.append(m)

    routes = []
    parents = {
        'curriculum-liberty-psychology-bs-online': psychology_parent,
        'curriculum-liberty-psychology-aa-online': aa_parent,
        'curriculum-liberty-accounting-bs-online': accounting_parent,
        'curriculum-liberty-accounting-bs-residential': accounting_parent,
    }
    for model in models:
        parent_id = parents.get(model['id']) or model['catalogParentId']
        suffix = model.get('routeSuffix') or ('online' if model['format'] == 'Online' else 'residential')
        route_id = parent_id + '-' + suffix
        model['routeIds'] = [route_id]
        model['catalogParentId'] = parent_id
        routes.append({'id': route_id, 'parentId': parent_id,
                       'school': model['school'], 'title': model['title'],
                       'level': model['level'], 'modalities': model['modalities'],
                       'url': model['sources'][0]['url']})
        all_major_c = any(part in model['id'] for part in ['accounting', 'computer-science', 'human-services'])
        for req in model['requirements']:
            if req['category'] == 'major' and (all_major_c or req.get('upper')):
                req['minimumGrade'] = 'C'
        model['graduationRequirements'].append({'id': 'major-minimum-grade', 'title': 'Major course grades',
            'detail': "At least C in all major and major-foundation requirements." if all_major_c else "At least C in upper-level major courses.",
            'sourceIds': [model['sources'][0]['id']]})
        if model['format'] == 'Online':
            model['sources'].append(copy.deepcopy(sources[0]))
        else:
            model['sources'].append(copy.deepcopy(sources[1]))
        major_ids = [r['id'] for r in model['requirements'] if r['category'] == 'major']
        general_ids = [r['id'] for r in model['requirements'] if r['category'] == 'general']
        elective_ids = [r['id'] for r in model['requirements'] if r['category'] == 'electives']
        sid = model['sources'][0]['id']
        model['curriculumSections'] = [
            {'id': 'general', 'title': 'General education and foundational skills', 'requirementIds': general_ids, 'sourceId': sid},
            {'id': 'major', 'title': 'Major and major foundations', 'requirementIds': major_ids, 'sourceId': sid},
            {'id': 'electives', 'title': 'Free electives', 'requirementIds': elective_ids, 'sourceId': sid},
        ]
    return {'version': 1, 'checkedOn': CHECKED, 'school': 'Liberty University',
            'sources': sources, 'routes': routes, 'models': models,
            'coverage': {'reviewedModels': len(models), 'scope': str(len(models)) + ' exact 2026–27 degree/delivery ledgers reviewed from official requirement tables. This is not the entire Liberty inventory.',
                         'gaps': ['Other degree variants and majors remain to be reviewed.', 'Exact accelerated-source equivalencies are attached by the separate receiving-course mapping compiler.', 'Declared delivery variants preserve the original parent programme rather than overwriting its format.']}}


if __name__ == '__main__':
    result = compile_models()
    target = ROOT / 'content/curricula/liberty.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    temporary.replace(target)
    # The separately reviewed receiving-course supplement also applies policy
    # corrections and the conservative online Business UNIV 104 allocation.
    subprocess.run(['node', str(ROOT / 'scripts/add-liberty-official-mappings.mjs')], check=True)
    print(json.dumps({'models': len(result['models']), 'totals': {m['id']: sum(r['credits'] for r in m['requirements']) for m in result['models']}, 'output': str(target)}))
